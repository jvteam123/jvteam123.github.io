
// settings.js

document.addEventListener('DOMContentLoaded', () => {
    const settingsButton = document.getElementById('tl-settings-button');
    const saveSettingsButton = document.getElementById('save-settings-button');

    if (settingsButton) {
        settingsButton.addEventListener('click', () => {
            const settings = JSON.parse(safeGetLocalStorage('tl_settings') || '{}');
            document.getElementById('tl-login-code-setting').value = settings.tlLoginCode || '';
            document.getElementById('project-json-url').value = settings.projectJsonUrl || '';
            document.getElementById('tl-code-json-url').value = settings.tlCodeJsonUrl || '';
            document.getElementById('include-headers').value = (settings.includeHeaders || []).join(',');
            document.getElementById('exclude-headers').value = (settings.excludeHeaders || []).join(',');
            document.getElementById('category-prices').value = JSON.stringify(settings.prices || []);
            M.updateTextFields();
            M.Modal.getInstance(document.getElementById('tl-settings-modal')).open();
        });
    }

    saveSettingsButton.addEventListener('click', () => {
        const settings = {
            tlLoginCode: document.getElementById('tl-login-code-setting').value.trim(),
            projectJsonUrl: document.getElementById('project-json-url').value.trim(),
            tlCodeJsonUrl: document.getElementById('tl-code-json-url').value.trim(),
            includeHeaders: document.getElementById('include-headers').value.split(',').map(h => h.trim()),
            excludeHeaders: document.getElementById('exclude-headers').value.split(',').map(h => h.trim()),
            prices: JSON.parse(document.getElementById('category-prices').value || '[]')
        };
        safeSetLocalStorage('tl_settings', JSON.stringify(settings));
        M.toast({ html: 'Settings saved!', classes: 'green' });
        M.Modal.getInstance(document.getElementById('tl-settings-modal')).close();
    });
});
