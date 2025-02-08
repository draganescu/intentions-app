// Register service worker for PWA
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js')
			.then(registration => console.log('ServiceWorker registered'))
			.catch(err => console.log('ServiceWorker registration failed: ', err));
	});
}

import { saveMessage, getMessages, getMessagesWithTags, getAllTags, searchMessages, saveFilter, getAllFilters, deleteFilter, deleteMessage, PAGE_SIZE } from './db.js';

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
const loadMoreBtn = document.getElementById('loadMoreBtn');
let isLoading = false;
let currentPage = 0;
let activeTagFilter = [];
let searchTimeout = null;
let isSearchMode = false;
let wasPasted = false;
let splitPasteEnabled = localStorage.getItem('splitPasteEnabled') !== 'false'; // Default to true
let showMessageNumbers = false;
// Add state tracking variables
let previousState = null;

// Tag sidebar functionality
const tagSidebar = document.querySelector('.tag-sidebar');
const toggleTagsBtn = document.getElementById('toggleTags');
const closeTagsBtn = document.getElementById('closeTags');
const tagList = document.getElementById('tagList');
const backdrop = document.querySelector('.sidebar-backdrop');

function openSidebar() {
	tagSidebar.classList.add('open');
	backdrop.classList.add('visible');
	document.body.style.overflow = 'hidden';
}

function closeSidebar() {
	tagSidebar.classList.remove('open');
	backdrop.classList.remove('visible');
	document.body.style.overflow = '';
}

// Toggle sidebar
toggleTagsBtn.addEventListener('click', () => {
	if (tagSidebar.classList.contains('open')) {
		closeSidebar();
	} else {
		openSidebar();
	}
});

closeTagsBtn.addEventListener('click', closeSidebar);
backdrop.addEventListener('click', closeSidebar);

// Close sidebar on escape key
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && tagSidebar.classList.contains('open')) {
		closeSidebar();
	}
});

// Initialize split paste toggle
const splitPasteToggle = document.getElementById('splitPasteToggle');
splitPasteToggle.checked = splitPasteEnabled;
splitPasteToggle.addEventListener('sl-change', (e) => {
	splitPasteEnabled = e.target.checked;
	localStorage.setItem('splitPasteEnabled', splitPasteEnabled);
});

// Add paste styles
const pasteStyle = document.createElement('style');
pasteStyle.textContent = `
	.message-input.pasted::part(textarea) {
		background-color: rgba(255, 253, 205, 0.3) !important;
		transition: background-color 0.3s ease;
	}
`;
document.head.appendChild(pasteStyle);

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

			tagItem.addEventListener('click', async () => {
				// Remove active class from all items (both tags and filters)
				tagList.querySelectorAll('.tag-item, .filter-item').forEach(item => {
					item.classList.remove('active');
				});

				if (activeTagFilter.length === 1 && activeTagFilter[0] === tag) {
					// Deactivate if clicking the active tag
					activeTagFilter = [];
					// Reset to page 0 and load all pages
					currentPage = 0;
					do {
						await loadMessages(currentPage > 0);
						if (loadMoreBtn.classList.contains('hidden')) break;
						currentPage++;
					} while (true);
				} else {
					// Activate only this tag
					activeTagFilter = [tag];
					tagItem.classList.add('active');
					currentPage = 0;
					loadMessages();
				}
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

					// Check if this filter is already active
					if (filterItem.classList.contains('active')) {
						// Deactivate the filter
						filterItem.classList.remove('active');
						textarea.value = '';
						isSearchMode = false;
						activeTagFilter = [];
						loadMessages();
						// Auto resize textarea
						const event = new Event('sl-input');
						textarea.dispatchEvent(event);
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

// Load more button click handler
loadMoreBtn.addEventListener('click', async () => {
	if (!isLoading) {
		currentPage++;
		await loadMessages(true);
	}
});

// Load messages
async function loadMessages(append = false) {
	if (isLoading) return;
	isLoading = true;

	loadMoreBtn.loading = true;

	try {
		const messages = activeTagFilter.length > 0
			? await getMessagesWithTags(activeTagFilter, currentPage)
			: await getMessages(currentPage);

		if (!append) {
			clearMessages();
		}

		// Add messages in order (newest at bottom)
		for (const msg of messages) {
			// Always insert after the load more button
			const loadMoreBtn = messagesContainer.querySelector('.load-more-btn');
			const messageElement = await addMessage(msg, msg.type, true);
			if (loadMoreBtn && messageElement) {
				messagesContainer.insertBefore(messageElement, loadMoreBtn.nextSibling);
			}
		}

		// Show/hide load more button based on whether there are more messages
		loadMoreBtn.classList.toggle('hidden', messages.length < PAGE_SIZE);

		// Scroll to bottom on first page load
		if (currentPage === 0) {
			scrollToBottom();
		}

	} catch (error) {
		console.error('Failed to load messages:', error);
		currentPage = Math.max(0, currentPage - 1); // Revert page increment if failed
	} finally {
		isLoading = false;
		loadMoreBtn.loading = false;
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

	// Create message content container
	const contentContainer = document.createElement('div');
	contentContainer.className = 'message-content';
	// Handle both string messages and message objects
	const messageText = typeof text === 'object' ? text.text : text;
	contentContainer.innerHTML = formatMessageText(messageText);

	// Add number pill
	const numberPill = document.createElement('div');
	numberPill.className = 'number-pill';

	// Add action menu
	const actionMenu = document.createElement('div');
	actionMenu.className = 'action-menu';
	actionMenu.innerHTML = `
		<sl-button size="small" variant="default">Done</sl-button>
		<sl-button size="small" variant="default">Details</sl-button>
		<sl-button size="small" variant="default">Delete</sl-button>
	`;

	// Add elements to message
	message.appendChild(numberPill);
	message.appendChild(contentContainer);
	message.appendChild(actionMenu);

	// Store the message timestamp for deletion
	let messageTimestamp;

	if (!skipStorage) {
		try {
			const savedMessage = await saveMessage(messageText, type);
			messageTimestamp = savedMessage.timestamp;
		} catch (error) {
			console.error('Failed to save message:', error);
		}
	} else {
		// For loaded messages, use their existing timestamp
		messageTimestamp = typeof text === 'object' ? text.timestamp : Date.now();
	}

	// Store the timestamp in a data attribute
	message.dataset.timestamp = messageTimestamp;

	// Add click handler for message selection
	message.addEventListener('click', (e) => {
		// Don't trigger selection if clicking action menu buttons or tags
		if (e.target.closest('sl-button') || e.target.closest('.tag')) return;

		// Deselect any other selected messages
		document.querySelectorAll('.message.selected').forEach(msg => {
			if (msg !== message) msg.classList.remove('selected');
		});

		// Toggle selection on this message
		message.classList.toggle('selected');
	});

	// Add click handlers for action menu buttons
	const [doneBtn, detailsBtn, deleteBtn] = actionMenu.querySelectorAll('sl-button');

	doneBtn.addEventListener('click', () => {
		message.classList.remove('selected');
		// Add your done action here
	});

	detailsBtn.addEventListener('click', () => {
		// Add your details action here
	});

	// Handle delete button with confirmation
	let deleteConfirmed = false;

	// Reset confirmation state when focus is lost
	const resetDeleteState = () => {
		deleteConfirmed = false;
		deleteBtn.classList.remove('delete-confirm');
		deleteBtn.textContent = 'Delete';
	};

	deleteBtn.addEventListener('click', async () => {
		if (!deleteConfirmed) {
			deleteConfirmed = true;
			deleteBtn.classList.add('delete-confirm');
			deleteBtn.textContent = 'Sure?';

			// Reset state when focus is lost
			const handleFocusOut = (event) => {
				// Check if the new focus target is outside the action menu
				if (!actionMenu.contains(event.relatedTarget)) {
					resetDeleteState();
					document.removeEventListener('focusout', handleFocusOut);
				}
			};

			document.addEventListener('focusout', handleFocusOut);

			// Also reset if user clicks elsewhere
			const handleClickOutside = (event) => {
				if (!actionMenu.contains(event.target)) {
					resetDeleteState();
					document.removeEventListener('click', handleClickOutside);
				}
			};

			document.addEventListener('click', handleClickOutside);

		} else {
			try {
				const timestamp = parseInt(message.dataset.timestamp, 10);
				if (!isNaN(timestamp)) {
					await deleteMessage(timestamp);
				}
				message.remove();
				// Refresh the message numbers if they're showing
				if (showMessageNumbers) {
					updateMessageNumbers(true);
				}
				// Refresh the tag list since we might have removed tags
				await updateTagList();
			} catch (error) {
				console.error('Failed to delete message:', error);
			}
			resetDeleteState();
		}
	});

	// Add click handlers for tags
	contentContainer.querySelectorAll('.tag').forEach(tagElement => {
		tagElement.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const tag = tagElement.dataset.tag;
			if (! activeTagFilter.includes(tag) ) {
				activeTagFilter.push(tag);
				loadMessages();
				updateTagList();
			}
		});
	});

	if (!skipStorage) {
		scrollToBottom();
	}

	messagesContainer.appendChild(message);
	return message;
}

// Scroll to bottom of messages
function scrollToBottom() {
	// Skip scrolling if we're in colon mode
	if (textarea.value.startsWith(':')) {
		return;
	}

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
	// Save the load more button
	const loadMoreBtn = messagesContainer.querySelector('.load-more-btn');
	messagesContainer.innerHTML = '';
	// Restore the load more button
	if (loadMoreBtn) {
		messagesContainer.appendChild(loadMoreBtn);
	}
}

// Add paste event handler
textarea.addEventListener('paste', () => {
	wasPasted = true;
	textarea.classList.add('pasted');
});

// Reset paste state
function resetPasteState() {
	wasPasted = false;
	textarea.classList.remove('pasted');
}

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

// Client-side filtering functions
function filterMessagesByTag(messages, tags) {
	return messages.filter(message => {
		const messageTags = extractTags(message.text);
		return tags.every(tag => messageTags.includes(tag.toLowerCase()));
	});
}

function filterMessagesBySearch(messages, searchTerms) {
	const terms = searchTerms.toLowerCase().split(/\s+/);
	return messages.filter(message => {
		const messageText = message.text.toLowerCase();
		return terms.every(term => messageText.includes(term));
	});
}

function extractTags(text) {
	const tagRegex = /#[\w-]+/g;
	const matches = text.match(tagRegex) || [];
	return [...new Set(matches.map(tag => tag.toLowerCase()))];
}

// Function to save current state
function saveCurrentState() {
	previousState = {
		currentPage,
		messages: Array.from(messagesContainer.querySelectorAll('.message')).map(msg => ({
			text: msg.querySelector('.message-content').textContent,
			type: msg.classList.contains('sent') ? 'sent' : 'received'
		})),
		hasMorePages: !loadMoreBtn.classList.contains('hidden')
	};
}

// Function to restore previous state
async function restorePreviousState() {
	if (!previousState) return;

	currentPage = previousState.currentPage;
	clearMessages();

	// Restore messages
	for (const msg of previousState.messages) {
		await addMessage(msg, msg.type, true);
	}

	// Show/hide load more button based on previous state
	loadMoreBtn.classList.toggle('hidden', !previousState.hasMorePages);

	previousState = null;
}

// Handle textarea input for search and commands
textarea.addEventListener('input', (e) => {
	const text = e.target.value;

	// Clear any pending search
	if (searchTimeout) {
		clearTimeout(searchTimeout);
	}

	// Save state before first operation
	if ((text.startsWith('#') || text.startsWith('/')) && !previousState) {
		saveCurrentState();
	}

	// Remove active state from filters if input is cleared or doesn't match any active filter
	if (!text.trim()) {
		tagList.querySelectorAll('.tag-item.active, .filter-item.active').forEach(item => {
			item.classList.remove('active');
		});
		// Restore previous state when input is cleared
		restorePreviousState();
		return;
	}

	// Parse input into ordered operations
	const operations = [];
	const parts = text.split(/\s+/);

	// First, identify the database operation (first # or / encountered)
	const maybeChain =
		( text.startsWith('#') ||
		text.startsWith('/') ) &&
		parts[0].length > 1;

	if (maybeChain) {
		operations.push({
			type: text.startsWith('#') ? 'tag' : 'search',
			value: text.startsWith('#') ? [parts[0]] : parts[0].slice(1),
			isDatabase: true
		});

		// Add remaining # and / operations as list filters
		parts.forEach((part, index) => {
			if (index !== 0) {
				if (part.startsWith('#') && part.length > 1) {
					operations.push({
						type: 'tag',
						value: [part],
						isDatabase: false
					});
				} else if (part.startsWith('/') && part.length > 1) {
					operations.push({
						type: 'search',
						value: part.slice(1),
						isDatabase: false
					});
				}
			}
		});
	}

	// Handle colon operator separately
	const hasColon = text.includes(':');
	const numberMatch = text.match(/:(\d+)/);

	// Show numbers immediately when colon is typed and maintain them
	if (hasColon) {
		updateMessageNumbers(true);
	} else {
		updateMessageNumbers(false);
	}

	// If we have operations, process them
	if (operations.length > 0) {
		searchTimeout = setTimeout(async () => {
			let results;

			// First, execute database operation
			const dbOp = operations.find(op => op.isDatabase);
			if (dbOp.type === 'tag') {
				results = await getMessagesWithTags(dbOp.value);
			} else {
				results = await searchMessages(dbOp.value);
			}

			// Then apply list filters in sequence
			const listOps = operations.filter(op => !op.isDatabase);
			if (results && results.length > 0) {
				for (const op of listOps) {
					if (op.type === 'tag') {
						results = filterMessagesByTag(results, op.value);
					} else {
						results = filterMessagesBySearch(results, op.value);
					}
				}
			}

			// Display results
			clearMessages();
			if (results && results.length > 0) {
				results.forEach(msg => addMessage(msg.text, msg.type, true));

				// Ensure numbers stay visible if colon is present
				if (hasColon) {
					updateMessageNumbers(true);
				}

				// Apply number selection if present
				if (numberMatch) {
					const targetNumber = parseInt(numberMatch[1], 10);
					const messages = Array.from(messagesContainer.querySelectorAll('.message'));
					messages.forEach((message, index) => {
						const messageNumber = messages.length - index;
						if (messageNumber === targetNumber) {
							message.classList.add('highlighted');
							message.scrollIntoView({ behavior: 'smooth', block: 'center' });
						} else {
							message.classList.remove('highlighted');
						}
					});
				} else {
					// Just show numbers without highlighting when only colon is present
					messagesContainer.querySelectorAll('.message').forEach(msg => {
						msg.classList.remove('highlighted');
					});
				}
			} else {
				const noResults = document.createElement('div');
				noResults.className = 'message-info';
				noResults.textContent = 'No messages found';
				messagesContainer.appendChild(noResults);
			}
		}, 300);
	} else if (hasColon) {
		// Only colon operation
		if (numberMatch) {
			const targetNumber = parseInt(numberMatch[1], 10);
			const messages = Array.from(messagesContainer.querySelectorAll('.message'));
			messages.forEach((message, index) => {
				const messageNumber = messages.length - index;
				if (messageNumber === targetNumber) {
					message.classList.add('highlighted');
					message.scrollIntoView({ behavior: 'smooth', block: 'center' });
				} else {
					message.classList.remove('highlighted');
				}
			});
		} else {
			// Just show numbers without highlighting
			messagesContainer.querySelectorAll('.message').forEach(msg => {
				msg.classList.remove('highlighted');
			});
		}
	} else {
		// No operations, only reset search/filter state without reloading messages
		isSearchMode = false;
		activeTagFilter = [];
		updateMessageNumbers(false);
		messagesContainer.querySelectorAll('.message').forEach(msg => {
			msg.classList.remove('highlighted');
		});
	}
});

// Update message numbers
function updateMessageNumbers(show = false) {
	showMessageNumbers = show;
	messagesContainer.classList.toggle('show-numbers', show);

	if (show) {
		const messages = Array.from(messagesContainer.querySelectorAll('.message'));
		messages.forEach((message, index) => {
			const numberPill = message.querySelector('.number-pill');
			if (numberPill) {
				numberPill.textContent = messages.length - index;
				message.classList.add('has-number');
			}
		});
	} else {
		messagesContainer.querySelectorAll('.message').forEach(message => {
			const numberPill = message.querySelector('.number-pill');
			if (numberPill) {
				numberPill.textContent = '';
				message.classList.remove('has-number');
			}
		});
	}
}

async function handleMessages () {
	const message = textarea.value.trim();
	if (message) {
		// Remove the colon prefix if present
		const actualMessage = message.startsWith(':') ? message.slice(1).trim() : message;
		if (actualMessage.startsWith('@')) {

			if (actualMessage === '@help') {
				helpModal.show();
			}
			// Clear input for all @ commands
			textarea.value = '';
			// Auto resize textarea after clearing
			const event = new Event('sl-input');
			textarea.dispatchEvent(event);
			return;
		}

		if (actualMessage.startsWith('/')) {
			// Save search filter
			const query = actualMessage.slice(1).trim();
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
		} else if (actualMessage.startsWith('#')) {
			// Save tag combination filter
			const tags = actualMessage.trim()
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

		if (splitPasteEnabled && wasPasted && (actualMessage.includes('\n') || actualMessage.includes('\r'))) {
			// Split pasted text into multiple messages, limit to 200
			const messages = actualMessage.split(/\r?\n/)
				.filter(msg => msg.trim())
				.slice(0, 200);

			if (messages.length > 200) {
				// Show notification about limit
				const notification = document.createElement('div');
				notification.className = 'message-info';
				notification.textContent = 'Message limit reached (200 messages maximum)';
				messagesContainer.appendChild(notification);
			}

			// Process all messages
			for (const msg of messages) {
				await addMessage(msg.trim(), 'sent');
			}

			// Update tag list without reloading messages
			await updateTagList();

		} else {
			await addMessage(actualMessage, 'sent');
			// Update tag list without reloading messages
			await updateTagList();
		}

		textarea.value = '';
		isSearchMode = false;
		resetPasteState();

		// Auto resize textarea
		const event = new Event('sl-input');
		textarea.dispatchEvent(event);

		// Maintain focus
		requestAnimationFrame(() => {
			textarea.focus();
		});
	}
}

// Update message form submission
messageForm.addEventListener('submit', async (e) => {
	e.preventDefault();
	await handleMessages();
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
	// Small delay to ensure components are defined
	requestAnimationFrame(() => {
		loadMessages();
		updateTagList();
	});
});

// Handle escape key globally
document.addEventListener('keydown', async (e) => {
	if (e.key === 'Enter' && document.activeElement === textarea) {
		e.preventDefault();
		e.stopPropagation();
		await handleMessages();
		return;
	}

	if (e.key === 'Escape' && document.activeElement !== textarea) {
		textarea.value = '';
		// Reset all states
		isSearchMode = false;
		resetPasteState();
		updateMessageNumbers(false);
		messagesContainer.querySelectorAll('.message').forEach(msg => {
			msg.classList.remove('highlighted');
		});
		// Auto resize textarea
		const event = new Event('sl-input');
		textarea.dispatchEvent(event);
	}
});