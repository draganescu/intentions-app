// Register service worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('ServiceWorker registered'))
            .catch(err => console.log('ServiceWorker registration failed: ', err));
    });
}

import { saveMessage, getMessages, getMessagesWithTags, getAllTags, searchMessages, saveFilter, getAllFilters, deleteFilter } from './db.js';

// Visual viewport handling for iOS
const viewport = window.visualViewport;
let lastHeight = window.innerHeight;

function handleResize() {
    const newHeight = window.visualViewport.height;
    document.documentElement.style.height = `${window.visualViewport.height}px`;
    
    // Scroll to bottom if keyboard appears
    if (newHeight < lastHeight) {
        scrollToBottom();
    }
    lastHeight = newHeight;
}

if (viewport) {
    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);
}

// Chat functionality
const messageForm = document.getElementById('messageForm');
const messagesContainer = document.getElementById('messages');
const textarea = messageForm.querySelector('sl-textarea');
const helpModal = document.querySelector('.help-modal');
let isLoading = false;
let currentPage = 0;
let activeTagFilter = [];
let searchTimeout = null;
let isSearchMode = false;

// Tag sidebar functionality
const tagSidebar = document.querySelector('.tag-sidebar');
const toggleTagsBtn = document.getElementById('toggleTags');
const closeTagsBtn = document.getElementById('closeTags');
const tagList = document.getElementById('tagList');

// Toggle sidebar
toggleTagsBtn.addEventListener('click', () => {
    tagSidebar.classList.toggle('open');
});

closeTagsBtn.addEventListener('click', () => {
    tagSidebar.classList.remove('open');
});

// Update tag list
async function updateTagList() {
    try {
        const [tags, filters] = await Promise.all([getAllTags(), getAllFilters()]);
        tagList.innerHTML = '';

        // Tags section
        const tagsSection = document.createElement('div');
        tagsSection.className = 'tag-list-section';
        tagsSection.innerHTML = '<h3>Tags</h3>';
        
        tags.forEach(tag => {
            const tagItem = document.createElement('div');
            tagItem.className = 'tag-item';
            if (activeTagFilter.length === 1 && activeTagFilter[0] === tag) {
                tagItem.classList.add('active');
            }

            tagItem.innerHTML = `
                <sl-icon name="hash"></sl-icon>
                <span>${tag.slice(1)}</span>
            `;

            tagItem.addEventListener('click', () => {
                // Remove active class from all items (both tags and filters)
                tagList.querySelectorAll('.tag-item, .filter-item').forEach(item => {
                    item.classList.remove('active');
                });

                if (activeTagFilter.length === 1 && activeTagFilter[0] === tag) {
                    // Deactivate if clicking the active tag
                    activeTagFilter = [];
                } else {
                    // Activate only this tag
                    activeTagFilter = [tag];
                    tagItem.classList.add('active');
                }
                loadMessages();
            });

            tagsSection.appendChild(tagItem);
        });
        
        tagList.appendChild(tagsSection);

        // Filters section
        if (filters.length > 0) {
            const filtersSection = document.createElement('div');
            filtersSection.className = 'tag-list-section';
            filtersSection.innerHTML = '<h3>Saved Filters</h3>';
            
            filters.forEach(filter => {
                const filterItem = document.createElement('div');
                filterItem.className = 'filter-item';
                
                let filterText;
                let icon;
                if (filter.type === 'tags') {
                    filterText = filter.tags.join(' ');
                    icon = 'hash';
                } else {
                    filterText = `"${filter.query}"`;
                    icon = 'search';
                }
                
                filterItem.innerHTML = `
                    <sl-icon name="${icon}"></sl-icon>
                    <span class="filter-text">${filterText}</span>
                    <sl-icon class="delete-filter" name="x-lg"></sl-icon>
                `;
                
                // Click handler for filter
                filterItem.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-filter')) {
                        e.stopPropagation();
                        deleteFilter(filter.id).then(() => {
                            updateTagList();
                        });
                        return;
                    }
                    
                    // Remove active class from all items (both tags and filters)
                    tagList.querySelectorAll('.tag-item, .filter-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    // Add active class to clicked filter
                    filterItem.classList.add('active');
                    
                    if (filter.type === 'tags') {
                        activeTagFilter = [...filter.tags];
                        loadMessages();
                    } else {
                        // Clear any active tag filters when activating a search filter
                        activeTagFilter = [];
                        textarea.value = '/' + filter.query;
                        isSearchMode = true;
                        performSearch(filter.query);
                    }
                    
                    // Close sidebar on mobile
                    if (window.innerWidth < 768) {
                        tagSidebar.classList.remove('open');
                    }
                });
                
                filtersSection.appendChild(filterItem);
            });
            
            tagList.appendChild(filtersSection);
        }
    } catch (error) {
        console.error('Failed to load tags and filters:', error);
    }
}

// Load messages
async function loadMessages() {
    if (isLoading) return;
    isLoading = true;

    try {
        const messages = activeTagFilter.length > 0 
            ? await getMessagesWithTags(activeTagFilter, 0)
            : await getMessages(0);
            
        clearMessages();
        
        // Add messages in chronological order (oldest first)
        messages.reverse().forEach(msg => {
            addMessage(msg.text, msg.type, true);
        });
    } catch (error) {
        console.error('Failed to load messages:', error);
    } finally {
        isLoading = false;
    }
}

// Format message text with highlighted tags
function formatMessageText(text) {
    return text.replace(/#[\w-]+/g, match => 
        `<span class="tag" data-tag="${match.toLowerCase()}">${match}</span>`
    );
}

// Add a message to the chat
async function addMessage(text, type, skipStorage = false) {
    const message = document.createElement('div');
    message.classList.add('message', type);
    message.innerHTML = formatMessageText(text);

    // Add click handlers for tags
    message.querySelectorAll('.tag').forEach(tagElement => {
        tagElement.addEventListener('click', () => {
            const tag = tagElement.dataset.tag;
            if (!activeTagFilter.includes(tag)) {
                activeTagFilter.push(tag);
                loadMessages();
                updateTagList();
            }
        });
    });

    if (!skipStorage) {
        // New messages always go at the bottom
        messagesContainer.appendChild(message);
        scrollToBottom();

        try {
            await saveMessage(text, type);
            await loadMessages();
            await updateTagList();
        } catch (error) {
            console.error('Failed to save message:', error);
        }
    } else {
        // For loaded messages, append at the bottom instead of inserting at top
        messagesContainer.appendChild(message);
        scrollToBottom();
    }
}

// Scroll to bottom of messages
function scrollToBottom() {
    // Ensure the scroll happens after the DOM is fully updated
    requestAnimationFrame(() => {
        const lastMessage = messagesContainer.lastElementChild;
        if (lastMessage) {
            lastMessage.scrollIntoView({ behavior: 'smooth' });
        }
    });
}

// Clear messages container
function clearMessages() {
    while (messagesContainer.firstChild) {
        messagesContainer.removeChild(messagesContainer.firstChild);
    }
}

// Handle textarea keyboard events
textarea.addEventListener('keydown', (e) => {
    // Send message on Enter (but not with Shift key)
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const message = textarea.value.trim();
        if (message) {
            addMessage(message, 'sent');
            textarea.value = '';
            
            // Auto resize textarea
            const event = new Event('sl-input');
            textarea.dispatchEvent(event);
            
            // Maintain focus
            requestAnimationFrame(() => {
                textarea.focus();
            });
        }
    }
});

// Debounced search function
async function performSearch(query) {
    if (isLoading) return;
    isLoading = true;

    try {
        const messages = await searchMessages(query);
        clearMessages();
        
        if (messages.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'message-info';
            noResults.textContent = 'No messages found';
            messagesContainer.appendChild(noResults);
        } else {
            messages.forEach(msg => {
                addMessage(msg.text, msg.type, true);
            });
        }
        scrollToBottom();
    } catch (error) {
        console.error('Search failed:', error);
    } finally {
        isLoading = false;
    }
}

// Handle textarea input for search
textarea.addEventListener('input', (e) => {
    const text = e.target.value;
    
    // Clear any pending search
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    if (text.startsWith('@')) {
        const command = text.trim();
        
        if (command === '@help') {
            helpModal.show();
            textarea.value = '';
            // Auto resize textarea after clearing
            const event = new Event('sl-input');
            textarea.dispatchEvent(event);
            return;
        }
    }
    
    if (text.startsWith('/')) {
        isSearchMode = true;
        // Clear any active tag filters when entering search mode
        activeTagFilter = [];
        const query = text.slice(1).trim();
        
        if (query) {
            // Debounce search with 300ms delay
            searchTimeout = setTimeout(() => {
                performSearch(query);
                // Update tag sidebar to show all tags as inactive
                const tagItems = tagList.querySelectorAll('.tag-item');
                tagItems.forEach(item => item.classList.remove('active'));
            }, 300);
        } else {
            // If search is empty, show normal messages
            loadMessages();
        }
    } else if (text.startsWith('#')) {
        isSearchMode = true;
        const tags = text.trim()
            .split(/\s+/)
            .filter(word => word.startsWith('#'))
            .map(tag => tag.toLowerCase());
            
        if (tags.length > 0) {
            // Debounce tag filtering with 300ms delay
            searchTimeout = setTimeout(() => {
                activeTagFilter = tags;
                loadMessages();
                updateTagList();
            }, 300);
        } else {
            // Clear all tag filters and update UI
            activeTagFilter = [];
            loadMessages();
            // Update tag sidebar to show all tags as inactive
            const tagItems = tagList.querySelectorAll('.tag-item');
            tagItems.forEach(item => item.classList.remove('active'));
        }
    } else if (isSearchMode) {
        // If we were in search mode but no longer are, reset to normal view
        isSearchMode = false;
        activeTagFilter = [];
        loadMessages();
        // Update tag sidebar to show all tags as inactive
        const tagItems = tagList.querySelectorAll('.tag-item');
        tagItems.forEach(item => item.classList.remove('active'));
    }
});

// Update message form submission
messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = textarea.value.trim();
    
    if (message) {
        if (message.startsWith('@')) {
            if (message === '@help') {
                helpModal.show();
            }
            // Clear input for all @ commands
            textarea.value = '';
            // Auto resize textarea after clearing
            const event = new Event('sl-input');
            textarea.dispatchEvent(event);
            return;
        }
        
        if (message.startsWith('/')) {
            // Save search filter
            const query = message.slice(1).trim();
            if (query) {
                try {
                    await saveFilter({
                        type: 'search',
                        query: query
                    });
                    updateTagList();
                } catch (error) {
                    console.error('Failed to save search filter:', error);
                }
            }
            return;
        } else if (message.startsWith('#')) {
            // Save tag combination filter
            const tags = message.trim()
                .split(/\s+/)
                .filter(word => word.startsWith('#'))
                .map(tag => tag.toLowerCase());
                
            if (tags.length > 0) {
                try {
                    await saveFilter({
                        type: 'tags',
                        tags: tags
                    });
                    updateTagList();
                } catch (error) {
                    console.error('Failed to save tag filter:', error);
                }
            }
            return;
        }
        
        addMessage(message, 'sent');
        textarea.value = '';
        isSearchMode = false;
        
        // Auto resize textarea
        const event = new Event('sl-input');
        textarea.dispatchEvent(event);
        
        // Maintain focus
        requestAnimationFrame(() => {
            textarea.focus();
        });
    }
});

// Update styles
const style = document.createElement('style');
style.textContent = `
    .message-info {
        text-align: center;
        color: var(--color-secondary);
        padding: 1rem;
        font-style: italic;
    }
`;
document.head.appendChild(style);

// Load messages when the app starts
window.addEventListener('load', () => {
    loadMessages();
    updateTagList();
}); 