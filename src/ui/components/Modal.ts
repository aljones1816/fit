export interface ModalOptions {
  title: string;
  body: string | HTMLElement;
  buttons: Array<{
    text: string;
    className?: string;
    onClick: () => void;
  }>;
}

export function showModal(options: ModalOptions) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  const modal = document.createElement('div');
  modal.className = 'modal';

  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = options.title;
  header.appendChild(title);

  const body = document.createElement('div');
  body.className = 'modal-body';
  if (typeof options.body === 'string') {
    body.textContent = options.body;
  } else {
    body.appendChild(options.body);
  }

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  options.buttons.forEach(btn => {
    const button = document.createElement('button');
    button.className = btn.className || 'btn btn-secondary';
    button.textContent = btn.text;
    button.onclick = () => {
      btn.onClick();
      closeModal();
    };
    footer.appendChild(button);
  });

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);

  container.innerHTML = '';
  container.appendChild(modal);
  container.classList.add('active');

  // Close on backdrop click
  container.onclick = (e) => {
    if (e.target === container) {
      closeModal();
    }
  };
}

export function closeModal() {
  const container = document.getElementById('modal-container');
  if (container) {
    container.classList.remove('active');
    container.innerHTML = '';
  }
}
