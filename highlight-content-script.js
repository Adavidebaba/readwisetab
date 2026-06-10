/**
 * HighlightTooltip — Popup flottante per salvare highlight
 * Mostra un pulsante vicino al testo selezionato.
 * Comunica con il background script via chrome.runtime.sendMessage.
 */
class HighlightTooltip {
  constructor() {
    this.tooltipElement = null;
    this.selectedText = '';
    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener('mouseup', (event) => this.handleMouseUp(event));
    document.addEventListener('mousedown', (event) => this.handleMouseDown(event));

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'saveSelectionFromContextMenu') {
        this.saveFromContextMenu();
        sendResponse({ received: true });
      }
      if (message.action === 'showHighlightResult') {
        if (message.success) {
          HighlightToast.show('✅ Salvato su Readwise!', 'success');
        } else {
          HighlightToast.show(message.error || 'Errore sconosciuto', 'error');
        }
        sendResponse({ received: true });
      }
      return false;
    });
  }

  handleMouseUp(event) {
    // Ignora clic sul tooltip stesso
    if (this.tooltipElement && this.tooltipElement.contains(event.target)) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (!text || text.length < 3) {
      this.hideTooltip();
      return;
    }

    this.selectedText = text;
    this.showTooltip(event.clientX, event.clientY);
  }

  handleMouseDown(event) {
    if (this.tooltipElement && !this.tooltipElement.contains(event.target)) {
      this.hideTooltip();
    }
  }

  showTooltip(mouseX, mouseY) {
    this.hideTooltip();

    const tooltip = document.createElement('div');
    tooltip.id = 'rw-highlight-tooltip';
    tooltip.innerHTML = `
      <button id="rw-highlight-save-btn" title="Salva su Readwise">
        <span class="rw-highlight-icon">📌</span>
        <span class="rw-highlight-label">Readwise</span>
      </button>
    `;

    document.body.appendChild(tooltip);
    this.tooltipElement = tooltip;

    this.positionTooltip(mouseX, mouseY);

    const saveBtn = tooltip.querySelector('#rw-highlight-save-btn');
    saveBtn.addEventListener('click', () => this.handleSaveClick());

    requestAnimationFrame(() => tooltip.classList.add('rw-highlight-visible'));
  }

  positionTooltip(mouseX, mouseY) {
    const tooltip = this.tooltipElement;
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    let left = mouseX + scrollX + 8;
    let top = mouseY + scrollY - tooltipRect.height - 10;

    // Evita overflow a destra
    if (left + tooltipRect.width > viewportWidth + scrollX) {
      left = mouseX + scrollX - tooltipRect.width - 8;
    }

    // Evita overflow in alto → mostra sotto
    if (top < scrollY) {
      top = mouseY + scrollY + 16;
    }

    // Evita overflow in basso
    if (top + tooltipRect.height > viewportHeight + scrollY) {
      top = viewportHeight + scrollY - tooltipRect.height - 8;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    if (!this.tooltipElement) return;
    this.tooltipElement.classList.remove('rw-highlight-visible');
    this.tooltipElement.classList.add('rw-highlight-hiding');
    setTimeout(() => {
      this.tooltipElement?.remove();
      this.tooltipElement = null;
    }, 150);
  }

  async handleSaveClick() {
    if (!this.selectedText) return;

    const btn = this.tooltipElement?.querySelector('#rw-highlight-save-btn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('rw-highlight-saving');
    }

    try {
      const response = await this.sendToBackground(this.selectedText);
      this.hideTooltip();
      if (response?.success) {
        HighlightToast.show('✅ Salvato su Readwise!', 'success');
      } else {
        HighlightToast.show(response?.error || 'Errore sconosciuto', 'error');
      }
    } catch (err) {
      this.hideTooltip();
      HighlightToast.show('Errore di comunicazione', 'error');
    }
  }

  saveFromContextMenu() {
    const selection = window.getSelection()?.toString().trim();
    if (!selection || selection.length < 3) {
      HighlightToast.show('Seleziona almeno 3 caratteri', 'error');
      return;
    }
    this.sendToBackground(selection).then((response) => {
      if (response?.success) {
        HighlightToast.show('✅ Salvato su Readwise!', 'success');
      } else {
        HighlightToast.show(response?.error || 'Errore sconosciuto', 'error');
      }
    });
  }

  sendToBackground(text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'saveHighlight',
          text: text,
          pageUrl: window.location.href,
          pageTitle: document.title
        },
        (response) => resolve(response)
      );
    });
  }
}

/**
 * HighlightToast — Mini notifiche animate
 * Mostra feedback dopo il salvataggio.
 */
class HighlightToast {
  static show(message, type = 'success') {
    // Rimuovi toast precedenti
    document.querySelectorAll('.rw-highlight-toast').forEach((el) => el.remove());

    const toast = document.createElement('div');
    toast.className = `rw-highlight-toast rw-highlight-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('rw-highlight-toast-visible'));

    setTimeout(() => {
      toast.classList.remove('rw-highlight-toast-visible');
      toast.classList.add('rw-highlight-toast-hiding');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
}

// ── Inizializzazione ──────────────────────────────────────────────────────────
new HighlightTooltip();
