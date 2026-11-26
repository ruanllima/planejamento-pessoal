/**
 * Gerenciador de Notificações Sobrepostas (Deck) com indicadores numéricos (exibidos apenas quando >= 2)
 * e gesto de deslize direcional (Pointer Events) para descarte fluido.
 */
export class ToastManager {
  constructor(containerId = 'toast-container') {
    this.host = document.getElementById(containerId);
    this.items = [];
    this.seqCounter = 0;
  }

  show(message, actionLabel = null, onAction = null, durationMs = 3200) {
    this.seqCounter += 1;
    const id = this.seqCounter;

    const item = {
      id,
      indexNumber: this.items.length + 1,
      message,
      actionLabel,
      onAction,
      timer: null,
      el: null
    };

    const card = document.createElement('div');
    card.className = 'toast-card';
    card.dataset.toastId = String(id);

    card.innerHTML = `
      <div class="toast-content">
        <span class="toast-count-badge hidden"></span>
        <span class="toast-msg">${this._escape(message)}</span>
      </div>
    `;

    if (actionLabel && onAction) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.style.padding = '4px 10px';
      btn.style.fontSize = '0.78rem';
      btn.textContent = actionLabel;
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.dismiss(id, 'up');
        await onAction();
      });
      card.appendChild(btn);
    }

    this._bindSwipeGesture(card, item);
    item.el = card;
    this.items.push(item);
    this.host.appendChild(card);

    this._relayoutStack();

    item.timer = setTimeout(() => {
      this.dismiss(id, 'right');
    }, durationMs);
  }

  _relayoutStack() {
    const total = this.items.length;
    if (total === 0) {
      this.seqCounter = 0;
      return;
    }

    this.items.forEach((item, idx) => {
      const badge = item.el.querySelector('.toast-count-badge');
      if (badge) {
        if (total >= 2) {
          badge.textContent = `${idx + 1}/${total}`;
          badge.classList.remove('hidden');
        } else {
          badge.textContent = '';
          badge.classList.add('hidden');
        }
      }

      const depthFromTop = total - 1 - idx;
      if (depthFromTop === 0) {
        item.el.style.zIndex = '30';
        item.el.style.transform = 'translate3d(0, 0, 0) scale(1)';
        item.el.style.opacity = '1';
      } else if (depthFromTop === 1) {
        item.el.style.zIndex = '20';
        item.el.style.transform = 'translate3d(0, -8px, 0) scale(0.96)';
        item.el.style.opacity = '0.82';
      } else {
        item.el.style.zIndex = '10';
        item.el.style.transform = 'translate3d(0, -14px, 0) scale(0.92)';
        item.el.style.opacity = '0';
      }
    });
  }

  _bindSwipeGesture(card, item) {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;

    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      currentX = 0;
      currentY = 0;
      card.classList.add('is-dragging');
      card.setPointerCapture(e.pointerId);
      if (item.timer) clearTimeout(item.timer);
    });

    card.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      currentX = e.clientX - startX;
      currentY = e.clientY - startY;
      const dist = Math.hypot(currentX, currentY);
      const opacity = Math.max(0.15, 1 - dist / 160);
      card.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      card.style.opacity = String(opacity);
    });

    const endGesture = () => {
      if (!isDragging) return;
      isDragging = false;
      card.classList.remove('is-dragging');

      const absX = Math.abs(currentX);
      const absY = Math.abs(currentY);

      if (absX > 48 || absY > 36) {
        let dir = 'right';
        if (absX >= absY) dir = currentX >= 0 ? 'right' : 'left';
        else dir = currentY >= 0 ? 'down' : 'up';
        this.dismiss(item.id, dir);
      } else {
        this._relayoutStack();
        item.timer = setTimeout(() => this.dismiss(item.id, 'right'), 2400);
      }
    };

    card.addEventListener('pointerup', endGesture);
    card.addEventListener('pointercancel', endGesture);
  }

  dismiss(id, direction = 'right') {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) return;

    const [removed] = this.items.splice(idx, 1);
    if (removed.timer) clearTimeout(removed.timer);

    const vectors = {
      right: 'translate3d(125%, 0, 0)',
      left: 'translate3d(-125%, 0, 0)',
      up: 'translate3d(0, -130%, 0)',
      down: 'translate3d(0, 130%, 0)'
    };

    removed.el.style.transition = 'transform 220ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease';
    removed.el.style.transform = vectors[direction] || vectors.right;
    removed.el.style.opacity = '0';

    setTimeout(() => {
      if (removed.el.parentNode) removed.el.remove();
    }, 220);

    this._relayoutStack();
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
