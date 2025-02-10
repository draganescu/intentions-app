export class SuperArea extends HTMLElement {
	static get observedAttributes() {
		return ['width', 'height', 'font'];
	}

	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.currentSize = 1;
		this.scrollTriggered = false;
		this.render();

		// Handle mobile focus behavior
		this.handleFocus = this.handleFocus.bind(this);
		this.handleBlur = this.handleBlur.bind(this);

		// Set initial font size
		const initialFontSize = this.getFontSizeForLevel(1);
		this.style.setProperty('--current-font-size', initialFontSize);
	}

	handleFocus() {
		if (window.innerWidth <= 768) {
			const textarea = this.shadowRoot.querySelector('textarea');
			const computedStyle = getComputedStyle(textarea);

			// Store current dimensions to prevent flash
			this.style.setProperty('--textarea-padding', computedStyle.padding);

			this.style.position = 'fixed';
			this.style.top = '0';
			this.style.left = '0';
			this.style.right = '0';
			this.style.bottom = '0';
			this.style.zIndex = '1000';
			this.style.margin = '0';
			this.style.height = '100%';
			this.style.width = '100%';

			textarea.style.borderRadius = '0';
			textarea.style.height = '100%';
			textarea.style.width = '100%';

			// Scroll to the cursor position after a small delay
			setTimeout(() => {
				textarea.scrollIntoView({ behavior: 'smooth' });
			}, 100);
		}
	}

	handleBlur() {
		if (window.innerWidth <= 768) {
			this.style.position = '';
			this.style.top = '';
			this.style.left = '';
			this.style.right = '';
			this.style.bottom = '';
			this.style.zIndex = '';
			this.style.margin = '';
			this.style.height = '';
			this.style.width = '';

			const textarea = this.shadowRoot.querySelector('textarea');
			textarea.style.borderRadius = '';
			textarea.style.height = '';
			textarea.style.width = '';
		}
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue !== newValue) {
			this.render();
		}
	}

	calculateFontSize(text) {
		// First check if we need to adjust for scrolling
		const maxWords = 150;
		const textarea = this.shadowRoot.querySelector('textarea');
		const availableHeight = textarea.clientHeight;
		const contentHeight = textarea.scrollHeight;
		const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
		const availableRows = Math.round(availableHeight / lineHeight);
		const currentRows = Math.round(contentHeight / lineHeight);
		const isOverflowing = currentRows > availableRows;
		if (isOverflowing) {
			// We need to shrink to fit with 2 rows remaining
			const currentFontSize = parseFloat(getComputedStyle(textarea).fontSize);
			const targetHeight = availableHeight - (2 * lineHeight);
			const ratio = availableRows / currentRows;
			const newFontSize = Math.round(currentFontSize * ratio) + 'px';
			// Convert to our level system (roughly)
			this.scrollTriggered = true;
			return newFontSize;
		}

		// Count words (very basic split; refine as needed)
		const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

		if (wordCount === 0) {
			this.scrollTriggered = false;
		}

		if (this.scrollTriggered) {
			return;
		}

		// Calculate proportion using a log-based approach
		const factor = 0.7;
		const ratio = Math.log(1 + factor * wordCount) / Math.log(1 + maxWords);
		if (ratio < 0.3) return 1;

		// Map 0 <= ratio <= 1 to sizes 1..7
		const size = Math.round(1 + 6 * ratio);
		// Clamp the result in case wordCount exceeds maxWords
		return Math.min(size, 7);
	}

	render() {
		const width = this.getAttribute('width') || '70vw';
		const height = this.getAttribute('height') || '70vh';
		const font = this.getAttribute('font') || 'JetBrains Mono';

		const textarea = document.createElement('textarea');
		textarea.spellcheck = false;

		// Add focus/blur handlers for mobile
		textarea.addEventListener('focus', this.handleFocus);
		textarea.addEventListener('blur', this.handleBlur);

		// Add input handler for font size calculation
		textarea.addEventListener('input', (e) => {
			const currentFontSize = parseFloat(getComputedStyle(textarea).fontSize);
			if (currentFontSize < 16) {
				return;
			}
			const newSize = this.calculateFontSize(e.target.value);
			if (newSize !== this.currentSize) {
				this.currentSize = newSize;
				if (Number.isFinite(newSize)) {
					const fontSize = this.getFontSizeForLevel(newSize);
					e.target.style.fontSize = fontSize;
					this.style.setProperty('--current-font-size', fontSize);
				} else {
					e.target.style.fontSize = newSize;
					this.style.setProperty('--current-font-size', newSize);
				}
			}
		});

		const style = document.createElement('style');
		style.textContent = `
			:host {
				display: block;
				margin: 1rem 0;
				box-sizing: border-box;
			}

			textarea {
				width: ${width};
				height: ${height};
				padding: 4rem;
				border: 1px solid rgba(0, 0, 0, 0.1);
				border-radius: 8px;
				background: white;
				color: #333;
				font-family: "${font}", monospace;
				font-size: var(--current-font-size, clamp(2rem, 6vw, 5rem));
				line-height: 1.8;
				resize: none;
				box-sizing: border-box;
				outline: none;
				caret-color: #4a90e2;
				caret-shape: bar;
				transition: all 0.3s ease;
				overflow-y: auto;
				-webkit-text-size-adjust: 100%;
				max-height: 100%;
			}

			@media (max-width: 768px) {
				textarea {
					padding: var(--textarea-padding, 2rem);
					min-height: 100%;
					font-size: var(--current-font-size, clamp(2rem, 6vw, 5rem));
				}

				:host {
					margin: 0;
					transition: all 0.3s ease;
				}
			}

			/* Modern scrollbar styling */
			textarea::-webkit-scrollbar {
				width: 8px;
				background: transparent;
			}

			textarea::-webkit-scrollbar-thumb {
				background: rgba(0, 0, 0, 0.2);
				border-radius: 4px;
			}

			textarea::-webkit-scrollbar-thumb:hover {
				background: rgba(0, 0, 0, 0.3);
			}

			/* For Firefox */
			textarea {
				scrollbar-width: thin;
				scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
			}

			textarea::selection {
				background: rgba(74, 144, 226, 0.2);
			}

			textarea:focus {
				outline: none;
			}
		`;

		this.shadowRoot.innerHTML = '';
		this.shadowRoot.append(style, textarea);
	}

	getFontSizeForLevel(level) {
		const sizes = {
			1: 'clamp(2rem, 6vw, 5rem)',
			2: 'clamp(1.75rem, 5vw, 4rem)',
			3: 'clamp(1.5rem, 4vw, 3.5rem)',
			4: 'clamp(1.25rem, 3vw, 3rem)',
			5: 'clamp(1rem, 2.5vw, 2.5rem)',
			6: 'clamp(0.875rem, 2vw, 2rem)',
			7: 'clamp(1rem, 1vw, 1.5rem)'
		};
		return sizes[level] || sizes[7];
	}
}

customElements.define('super-area', SuperArea);