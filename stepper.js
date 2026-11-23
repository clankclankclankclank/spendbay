// Plain JavaScript adaptation of the supplied Stepper interaction.
function installStepper(form, labels, fields) {
  const indicator = document.createElement('ol');
  indicator.className = 'stepper-indicator';
  const panels = fields.map(group => {
    const panel = document.createElement('div');
    panel.className = 'stepper-panel';
    form.prepend(panel);
    panel.append(...group);
    return panel;
  });
  form.prepend(indicator);
  const items = labels.map(label => indicator.appendChild(Object.assign(document.createElement('li'), {textContent:label})));
  const actions = form.querySelector('.actions');
  const submit = actions.querySelector('[type=submit]');
  function navigation(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    actions.insertBefore(button, submit);
    return button;
  }
  const back = navigation('Back');
  const next = navigation('Continue');
  let current = 0;
  function show(index) {
    current = index;
    panels.forEach((panel, i) => { panel.hidden = i !== index; });
    items.forEach((item, i) => {
      if (i === index) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    back.hidden = index === 0;
    next.hidden = submit.hidden = false;
    next.hidden = index === panels.length - 1;
    submit.hidden = !next.hidden;
  }
  back.onclick = () => show(current - 1);
  next.onclick = () => {
    for (const input of panels[current].querySelectorAll('input,select')) {
      if (!input.closest('[hidden]') && !input.reportValidity()) return;
    }
    show(current + 1);
    (panels[current].querySelector('input,select') || submit).focus();
  };
  form.addEventListener('submit', event => {
    if (current === panels.length - 1) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    next.click();
  }, true);
  form.addEventListener('invalid', event => {
    const index = panels.findIndex(panel => panel.contains(event.target));
    if (event.target.closest('[hidden]') && index >= 0) show(index);
  }, true);
  form.closest('dialog').addEventListener('close', () => show(0));
  show(0);
}
const localNode = id => document.getElementById(id);
const labelsFor = (...ids) => ids.map(id => localNode(id).closest('label'));
installStepper(localNode('entry-form'), ['Payment', 'Details'], [
  labelsFor('entry-date','entry-type','entry-currency','entry-amount'),
  [...labelsFor('entry-description','entry-category','custom-category','entry-subcategory'), localNode('entry-error')]
]);
installStepper(localNode('import-form'), ['Map columns', 'Review'], [
  [localNode('import-mapping')],
  [localNode('import-feedback'), localNode('import-rows').closest('.table-scroll')]
]);
