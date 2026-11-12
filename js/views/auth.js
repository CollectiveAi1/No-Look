import { h, swap } from '../dom.js';
import { BRAND } from '../brand.js';
import { track } from '../analytics.js';

function field(label, attrs) {
  const input = h('input', { class: 'field__input', ...attrs });
  return { input, row: h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), input) };
}

export function authView(app) {
  let mode = 'signin'; // signin | signup | recover | confirm | sent
  const root = h('main', { class: 'auth' });

  function render(errorText = '') {
    const heading = { signin: 'Sign in', signup: 'Create your account', recover: 'Reset your password', confirm: 'Check your email', sent: 'Check your email' }[mode];
    const email = field('Email', { type: 'email', name: 'email', autocomplete: 'email', required: true, inputmode: 'email' });
    const password = field('Password', {
      type: 'password', name: 'password', required: true, minlength: 8,
      autocomplete: mode === 'signup' ? 'new-password' : 'current-password',
      'aria-describedby': mode === 'signup' ? 'password-hint' : null,
    });
    const displayName = field('Display name (optional)', { type: 'text', name: 'displayName', autocomplete: 'nickname', maxlength: 40 });
    const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' },
      { signin: 'Sign in', signup: 'Create account', recover: 'Send reset link' }[mode]);
    const error = h('p', { class: 'form-error', role: 'alert' }, errorText);

    async function onSubmit(event) {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Working…';
      error.textContent = '';
      try {
        if (mode === 'recover') {
          await app.backend.requestPasswordReset(email.input.value.trim());
          mode = 'sent';
          return render();
        }
        const credentials = { email: email.input.value.trim(), password: password.input.value };
        if (mode === 'signup') {
          const outcome = await app.backend.signUp({ ...credentials, displayName: displayName.input.value });
          track('account_created');
          if (outcome.needsConfirmation) {
            mode = 'confirm';
            return render();
          }
        } else {
          await app.backend.signIn(credentials);
        }
        track('sign_in_completed');
        await app.onSignedIn();
      } catch (failure) {
        render(failure.message || 'Something went wrong. Try again.');
      }
    }

    const switchTo = (next, label) => h('button', { class: 'link', type: 'button', on: { click: () => { mode = next; render(); } } }, label);

    let body;
    if (mode === 'confirm' || mode === 'sent') {
      body = h('div', { class: 'auth__panel' },
        h('p', { class: 'auth__note' }, mode === 'confirm'
          ? 'Your account is created but not active yet. Open the confirmation link we emailed you, then sign in here.'
          : 'If that email has an account, a reset link is on its way. Open it on this device to choose a new password.'),
        h('button', { class: 'btn btn--primary btn--block', type: 'button', on: { click: () => { mode = 'signin'; render(); } } }, 'Back to sign in'));
    } else {
      body = h('form', { class: 'auth__panel', on: { submit: onSubmit }, novalidate: false },
        mode === 'signup' ? displayName.row : null,
        email.row,
        mode === 'recover' ? null : password.row,
        mode === 'signup' ? h('p', { class: 'field__hint', id: 'password-hint' }, 'At least 8 characters.') : null,
        error,
        submit,
        h('div', { class: 'auth__switch' },
          mode === 'signin' ? [switchTo('signup', 'Create an account'), switchTo('recover', 'Forgot password?')] : switchTo('signin', 'Back to sign in')));
    }

    swap(root,
      h('header', { class: 'auth__brand' },
        h('p', { class: 'wordmark' }, BRAND.name),
        h('p', { class: 'auth__tagline' }, BRAND.tagline)),
      h('h1', { class: 'auth__title' }, heading),
      body,
      app.backend.mode === 'preview'
        ? h('p', { class: 'preview-note' }, 'Preview build: accounts and workouts stay on this device only.')
        : null);
    root.querySelector('input')?.focus({ preventScroll: true });
  }

  render();
  return { el: root };
}

export function resetView(app) {
  const password = field('New password', { type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Save new password');
  const form = h('form', { class: 'auth__panel', on: { submit: async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await app.backend.updatePassword(password.input.value);
      app.go('#/');
    } catch (failure) {
      error.textContent = failure.message;
      submit.disabled = false;
    }
  } } }, password.row, error, submit);
  return { el: h('main', { class: 'auth' }, h('h1', { class: 'auth__title' }, 'Choose a new password'), form) };
}
