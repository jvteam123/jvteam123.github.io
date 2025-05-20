
// login.js

document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('login-button');
    const loginRole = document.getElementById('login-role');
    const tlCodeInput = document.getElementById('tl-code-input');
    const tlLoginCode = document.getElementById('tl-login-code');

    loginRole.addEventListener('change', () => {
        tlCodeInput.style.display = loginRole.value === 'tl' ? 'block' : 'none';
    });

    loginButton.addEventListener('click', () => {
        const role = loginRole.value;
        if (role === 'tl') {
            const stored = JSON.parse(safeGetLocalStorage('tl_settings') || '{}');
            if (tlLoginCode.value === stored.tlLoginCode) {
                M.toast({ html: 'Logged in as TL', classes: 'green' });
                document.getElementById('main-app-content').style.display = 'block';
            } else {
                M.toast({ html: 'Invalid TL code', classes: 'red' });
            }
        } else {
            M.toast({ html: 'Logged in as Tech', classes: 'blue' });
            document.getElementById('main-app-content').style.display = 'block';
        }
    });
});
