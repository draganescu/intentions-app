const DB_NAME = 'intentionsDB';
const DB_VERSION = 3;
const STORE_NAME = 'messages';
const TAG_STORE = 'tags';
const MESSAGE_TAGS_STORE = 'messageTags';
const FILTERS_STORE = 'filters';
const PAGE_SIZE = 50;

let db = null;

// Extract tags from message text
function extractTags(text) {
    const tagRegex = /#[\w-]+/g;
    const matches = text.match(tagRegex) || [];
    return [...new Set(matches.map(tag => tag.toLowerCase()))];
}

// Open database connection
async function openDB() {
    if (db) return db;
    
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Messages store
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { 
                    keyPath: 'timestamp',
                    autoIncrement: false
                });
                store.createIndex('timestamp', 'timestamp');
            }
            
            // Tags store
            if (!db.objectStoreNames.contains(TAG_STORE)) {
                const tagStore = db.createObjectStore(TAG_STORE, {
                    keyPath: 'name'
                });
            }
            
            // Message-Tags relationship store
            if (!db.objectStoreNames.contains(MESSAGE_TAGS_STORE)) {
                const messageTagsStore = db.createObjectStore(MESSAGE_TAGS_STORE, {
                    keyPath: ['messageTimestamp', 'tag']
                });
                messageTagsStore.createIndex('tag', 'tag');
                messageTagsStore.createIndex('messageTimestamp', 'messageTimestamp');
            }

            // Filters store
            if (!db.objectStoreNames.contains(FILTERS_STORE)) {
                const filtersStore = db.createObjectStore(FILTERS_STORE, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                filtersStore.createIndex('type', 'type'); // 'tags' or 'search'
            }
        };
    });
}

// Add a message to the database
export async function saveMessage(text, type) {
    const database = await openDB();
    const tx = database.transaction([STORE_NAME, TAG_STORE, MESSAGE_TAGS_STORE], 'readwrite');
    
    const message = {
        text,
        type,
        timestamp: Date.now()
    };

    try {
        // Save message
        await new Promise((resolve, reject) => {
            const request = tx.objectStore(STORE_NAME).add(message);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        // Process tags
        const tags = extractTags(text);
        if (tags.length > 0) {
            const tagStore = tx.objectStore(TAG_STORE);
            const messageTagsStore = tx.objectStore(MESSAGE_TAGS_STORE);

            // Save each tag and message-tag relationship
            await Promise.all(tags.map(async tag => {
                // Try to add the tag, ignore if it already exists
                await new Promise((resolve) => {
                    const request = tagStore.put({ name: tag });
                    request.onsuccess = () => resolve();
                    request.onerror = () => resolve();
                });

                // Save message-tag relationship
                await new Promise((resolve, reject) => {
                    const messageTag = {
                        messageTimestamp: message.timestamp,
                        tag: tag
                    };
                    const request = messageTagsStore.add(messageTag);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }));
        }

        return message;
    } catch (error) {
        tx.abort();
        throw error;
    }
}

// Get total count of messages
export async function getMessageCount() {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get messages for a specific page
export async function getMessages(page = 0) {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');

    return new Promise((resolve, reject) => {
        const messages = [];
        let skipCount = page * PAGE_SIZE;
        let count = 0;

        const cursorRequest = index.openCursor(null, 'prev');
        
        cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) {
                resolve(messages);
                return;
            }

            if (skipCount > 0) {
                skipCount--;
                cursor.continue();
                return;
            }

            if (count < PAGE_SIZE) {
                messages.push(cursor.value);
                count++;
                cursor.continue();
            } else {
                resolve(messages);
            }
        };

        cursorRequest.onerror = () => reject(cursorRequest.error);
    });
}

// Get the last page of messages
export async function getLastPage() {
    const count = await getMessageCount();
    const totalPages = Math.ceil(count / PAGE_SIZE);
    return Math.max(0, totalPages - 1);
}

// Get messages with specific tags
export async function getMessagesWithTags(tags = [], page = 0) {
    const database = await openDB();
    const tx = database.transaction([STORE_NAME, MESSAGE_TAGS_STORE], 'readonly');
    const messageStore = tx.objectStore(STORE_NAME);
    const messageTagsStore = tx.objectStore(MESSAGE_TAGS_STORE);
    const tagIndex = messageTagsStore.index('tag');

    if (tags.length === 0) {
        return getMessages(page);
    }

    // Get message timestamps for each tag
    const messageTimestampSets = await Promise.all(tags.map(async tag => {
        return new Promise((resolve, reject) => {
            const timestamps = new Set();
            const cursorRequest = tagIndex.openCursor(IDBKeyRange.only(tag.toLowerCase()));
            
            cursorRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    timestamps.add(cursor.value.messageTimestamp);
                    cursor.continue();
                } else {
                    resolve(timestamps);
                }
            };
            cursorRequest.onerror = () => reject(cursorRequest.error);
        });
    }));

    // Find common timestamps (messages that have all tags)
    const commonTimestamps = [...messageTimestampSets.reduce((acc, set) => {
        if (acc === null) return set;
        return new Set([...acc].filter(x => set.has(x)));
    }, null)];

    // Sort timestamps in reverse order and apply pagination
    const paginatedTimestamps = commonTimestamps
        .sort((a, b) => b - a)
        .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    // Get messages for the timestamps
    const messages = await Promise.all(paginatedTimestamps.map(timestamp => {
        return new Promise((resolve, reject) => {
            const request = messageStore.get(timestamp);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }));

    return messages;
}

// Get all tags
export async function getAllTags() {
    const database = await openDB();
    const tx = database.transaction(TAG_STORE, 'readonly');
    const store = tx.objectStore(TAG_STORE);

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result.map(tag => tag.name));
        request.onerror = () => reject(request.error);
    });
}

// Search messages
export async function searchMessages(query) {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');

    return new Promise((resolve, reject) => {
        const messages = [];
        const cursorRequest = index.openCursor(null, 'prev');
        const searchTerms = query.toLowerCase().split(/\s+/);
        
        cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) {
                resolve(messages);
                return;
            }

            const messageText = cursor.value.text.toLowerCase();
            // Message matches if it contains all search terms
            if (searchTerms.every(term => messageText.includes(term))) {
                messages.push(cursor.value);
            }
            cursor.continue();
        };

        cursorRequest.onerror = () => reject(cursorRequest.error);
    });
}

// Save a filter
export async function saveFilter(filter) {
    const database = await openDB();
    const tx = database.transaction(FILTERS_STORE, 'readwrite');
    const store = tx.objectStore(FILTERS_STORE);

    return new Promise((resolve, reject) => {
        const request = store.add(filter);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get all filters
export async function getAllFilters() {
    const database = await openDB();
    const tx = database.transaction(FILTERS_STORE, 'readonly');
    const store = tx.objectStore(FILTERS_STORE);

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Delete a filter
export async function deleteFilter(id) {
    const database = await openDB();
    const tx = database.transaction(FILTERS_STORE, 'readwrite');
    const store = tx.objectStore(FILTERS_STORE);

    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Delete a message and its associated tags
export async function deleteMessage(timestamp) {
    const database = await openDB();
    const tx = database.transaction([STORE_NAME, MESSAGE_TAGS_STORE], 'readwrite');
    const messageStore = tx.objectStore(STORE_NAME);
    const messageTagsStore = tx.objectStore(MESSAGE_TAGS_STORE);

    try {
        // Delete message-tag relationships first
        await new Promise((resolve, reject) => {
            const index = messageTagsStore.index('messageTimestamp');
            const request = index.openCursor(IDBKeyRange.only(timestamp));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });

        // Then delete the message
        await new Promise((resolve, reject) => {
            const request = messageStore.delete(timestamp);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        tx.abort();
        throw error;
    }
}

export { PAGE_SIZE };