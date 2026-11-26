export class ModalManager {
  constructor() {
    this.backdrop = document.getElementById('modal-backdrop');
    this.titleEl = document.getElementById('modal-title');
    this.bodyEl = document.getElementById('modal-body');
    this.closeBtn = document.getElementById('modal-close');

    this.closeBtn.addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.backdrop.classList.contains('hidden')) {
        this.close();
      }
    });
  }

  open(title, contentNodeOrHTML) {
    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = '';
    if (typeof contentNodeOrHTML === 'string') {
      this.bodyEl.innerHTML = contentNodeOrHTML;
    } else {
      this.bodyEl.appendChild(contentNodeOrHTML);
    }
    this.backdrop.classList.remove('hidden');
    this.backdrop.setAttribute('aria-hidden', 'false');
  }

  close() {
    this.backdrop.classList.add('hidden');
    this.backdrop.setAttribute('aria-hidden', 'true');
    this.bodyEl.innerHTML = '';
  }
}
