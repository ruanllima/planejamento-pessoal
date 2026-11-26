export class ModalManager {
  constructor() {
    this.backdrop = document.getElementById('modal-backdrop');
    this.titleEl = document.getElementById('modal-title');
    this.bodyEl = document.getElementById('modal-body');
    this.closeBtn = document.getElementById('modal-close');
    this.appMain = document.getElementById('app-main');

    this.closeBtn.addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });
    this.backdrop.addEventListener(
      'touchmove',
      (e) => {
        if (!e.target.closest('.modal-sheet')) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
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
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    if (this.appMain) this.appMain.classList.add('modal-open');

    this.backdrop.classList.remove('hidden');
    this.backdrop.setAttribute('aria-hidden', 'false');
  }

  close() {
    this.backdrop.classList.add('hidden');
    this.backdrop.setAttribute('aria-hidden', 'true');
    this.bodyEl.innerHTML = '';

    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    if (this.appMain) this.appMain.classList.remove('modal-open');
  }
}
