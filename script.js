// --- Configuration ---
const HARDCODED_PROJECTS_JSON_URL = 'https://raw.githubusercontent.com/serhgs/project_data.json/refs/heads/main/update.json';
const HARDCODED_TL_CODE_URL = 'https://raw.githubusercontent.com/gmlorenz/gmlorenz.github.io/refs/heads/main/projects_data.json';
const PRICES = [
    { "3in": 2.19, "9in": 0.99 },
    { "3in": 5.86, "9in": 2.08 },
    { "3in": 7.44, "9in": 2.78 },
    { "3in": 2.29, "9in": 1.57 },
    { "3in": 1.55, "9in": 0.60 },
    { "3in": 1.84, "9in": 0.78 },
    { "3in": 1.00, "9in": 1.00 },
    { "3in": 3.74, "9in": 3.74 },
    { "3in": 1.73, "9in": 1.73 }
];

// --- DOM Elements ---
const projectSelector = document.getElementById('project-selector');
const rawDataInput = document.getElementById('raw-data');
const projectNameInput = document.getElementById('project-name');
const techIdInput = document.getElementById('tech-id');
const outputDiv = document.getElementById('output');
const allResultsDiv = document.getElementById('all-results');
const addProjectModal = document.querySelector('#add-project-modal');
const modalTitle = document.getElementById('modal-title');
const saveProjectModalButton = document.getElementById('save-project-modal-button');
const clearDataButton = document.getElementById('clear-data-button');
const addProjectButton = document.getElementById('add-project-button');
const mainAppContent = document.getElementById('main-app-content');
const logoutButton = document.getElementById('logout-button');
const loginModal = document.getElementById('login-modal');
const loginRoleSelect = document.getElementById('login-role');
const tlCodeInputDiv = document.getElementById('tl-code-input');
const tlLoginCodeInput = document.getElementById('tl-login-code');
const loginButtonElement = document.getElementById('login-button');
const fullscreenResultsModal = document.getElementById('fullscreen-results-modal');
const fullscreenResultsContent = document.getElementById('fullscreen-results-content');
const fullscreenCloseButton = fullscreenResultsContent.querySelector('.close-button');
const viewDataModal = document.getElementById('view-data-modal');
const viewDataTableContainer = document.getElementById('view-data-table-container');
const viewDataModalTitle = document.getElementById('view-data-modal-title');
const viewDataSpinner = document.getElementById('view-data-spinner');
const multiplierInput = document.getElementById('total-multiplier');
const applyMultiplierButton = document.getElementById('apply-multiplier');
const modalSizeSelect = document.getElementById('modal-size');
const modalIrCheck = document.getElementById('modal-ir-check');
const viewProjectDataButton = document.getElementById('view-project-data-button');
const autoFetchButton = document.getElementById('auto-fetch-external-json');
const darkModeToggle = document.getElementById('dark-mode-toggle');

// New Confirmation Modal Elements
const confirmationModal = document.getElementById('confirmation-modal');
const confirmationModalTitle = document.getElementById('confirmation-modal-title');
const confirmationModalMessage = document.getElementById('confirmation-modal-message');
const confirmationConfirmButton = document.getElementById('confirmation-confirm-button');
const confirmationCancelButton = document.getElementById('confirmation-cancel-button');


// --- Global State ---
let activeProjectData = '';
let allCalculatedResults = [];
let lastResult = '';
let allProjectsAggregatedResults = {};
let editingProjectName = null;
let isLoggedInAsTL = false;
let confirmPromiseResolve = null;

// --- Utility Functions ---
function showToast(html, classes = '') {
    M.toast({ html, classes });
}

function showLoader() {
    const loader = document.getElementById('loader-spinner');
    if (loader) loader.style.display = 'block';
}

function hideLoader() {
    const loader = document.getElementById('loader-spinner');
    if (loader) loader.style.display = 'none';
}

function safeSetLocalStorage(key, value) {
    try {
        const compressedValue = LZString.compressToUTF16(value);
        if (compressedValue === null) {
            throw new Error("Compression failed.");
        }
        localStorage.setItem(key, compressedValue);
        return true;
    } catch (e) {
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
            showToast('Local storage full! Could not save project.', 'red');
        } else {
            showToast(`Error saving project data to local storage. ${e.message}`, 'red');
            console.error("Local storage save error:", e);
        }
        return false;
    }
}

function safeGetLocalStorage(key) {
    try {
        const value = localStorage.getItem(key);
        if (value === null) {
            return null;
        }

        let decompressedValue = LZString.decompressFromUTF16(value);
        if (decompressedValue !== null) {
            return decompressedValue;
        }

        console.warn(`Decompression failed for key "${key}". Attempting to load as uncompressed data.`);
        return value;
    } catch (e) {
        console.error(`Error retrieving or decompressing data for key "${key}":`, e);
        showToast('Error loading project data. Data might be corrupted.', 'red');
        return null;
    }
}

function showCustomConfirm(message, title = 'Confirm Action') {
    return new Promise(resolve => {
        confirmationModalTitle.textContent = title;
        confirmationModalMessage.textContent = message;
        M.Modal.getInstance(confirmationModal).open();
        confirmPromiseResolve = resolve;
    });
}

// --- UI Component Functions ---
function loadProjectList() {
    projectSelector.innerHTML = '<option value="" disabled selected>Select a saved project</option>';
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('tl_project_')) {
            const name = key.replace('tl_project_', '');
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            projectSelector.appendChild(option);
        }
    }
    M.FormSelect.init(projectSelector);
}

function addResultButtons(targetDiv) {
    const existingButtons = targetDiv.querySelector('.result-buttons');
    if (existingButtons) {
        existingButtons.remove();
    }

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'result-buttons';

    if (targetDiv.id === 'output' && lastResult) {
        const viewDataButton = document.createElement('button');
        viewDataButton.className = 'view-data-result-button';
        viewDataButton.innerHTML = '<i class="material-icons">table_chart</i>';
        viewDataButton.title = 'View Raw Data for this TECH ID';
        viewDataButton.addEventListener('click', () => {
            if (!activeProjectData || !activeProjectData.data) {
                showToast('No data loaded for the selected project to view.', 'orange');
                return;
            }
            displayDataTableInModal(activeProjectData.data, lastResult.techID);
        });
        buttonsContainer.appendChild(viewDataButton);
    }

    const expandButton = document.createElement('button');
    expandButton.className = 'expand-button';
    expandButton.innerHTML = '<i class="material-icons">fullscreen</i>';
    expandButton.title = 'Expand Results';
    expandButton.addEventListener('click', () => {
        let contentToExpand = targetDiv.cloneNode(true);
        const clonedButtonsContainer = contentToExpand.querySelector('.result-buttons');
        if (clonedButtonsContainer) {
            clonedButtonsContainer.remove();
        }

        fullscreenResultsContent.innerHTML = '';
        fullscreenResultsContent.appendChild(contentToExpand);

        const closeButtonElement = document.createElement('button'); // Renamed to avoid conflict with global fullscreenCloseButton
        closeButtonElement.classList.add('close-button');
        closeButtonElement.innerHTML = '<i class="material-icons">close</i>';
        closeButtonElement.addEventListener('click', hideFullscreenModal);
        fullscreenResultsContent.appendChild(closeButtonElement);

        fullscreenResultsModal.style.display = 'flex';
    });
    buttonsContainer.appendChild(expandButton);

    targetDiv.prepend(buttonsContainer);
}

function removeResultButtons(containerElement) {
    const existingButtonsContainer = containerElement.querySelector('.result-buttons');
    if (existingButtonsContainer) {
        existingButtonsContainer.remove();
    }
}

function hideFullscreenModal() {
    fullscreenResultsModal.style.display = 'none';
    fullscreenResultsContent.innerHTML = '';
}

function displayDataTableInModal(rawDataString, techIDFilter = '') {
    viewDataTableContainer.innerHTML = '';
    viewDataSpinner.style.display = 'flex';

    setTimeout(() => {
        const rows = String(rawDataString).split(/\r?\n/).filter(r => r.trim() !== "");

        if (rows.length === 0) {
            viewDataTableContainer.innerHTML = '<p>No data available for this project.</p>';
        } else {
            const headers = rows.shift()?.split(/[\t,]/).map(h => h.trim()) || [];
            const headersUpperCase = headers.map(h => h.toUpperCase());
            const fixIdIndex = headersUpperCase.indexOf("FIX1_ID");

            let tableHtml = '<table class="striped"><thead><tr>';

            headers.forEach(headerText => {
                tableHtml += `<th>${headerText}</th>`;
            });
            tableHtml += '</tr></thead><tbody>';

            let foundRows = false;
            rows.forEach(row => {
                const fields = row.split(/[\t,]/).map(f => f.trim());

                if (techIDFilter === '' || fixIdIndex === -1 || (fixIdIndex !== -1 && fields[fixIdIndex]?.toUpperCase() === techIDFilter)) {
                    foundRows = true;
                    tableHtml += '<tr>';
                    fields.forEach(field => {
                        tableHtml += `<td>${field}</td>`;
                    });
                    tableHtml += '</tr>';
                }
            });

            tableHtml += '</tbody></table>';

            if (foundRows || techIDFilter === '') {
                viewDataTableContainer.innerHTML = tableHtml;
            } else {
                viewDataTableContainer.innerHTML = `<p>No data found for TECH ID: ${techIDFilter}.</p>`;
            }
        }

        let modalTitleText = `Data for Project: ${projectSelector.value || 'Loaded Project'}`;
        if (techIDFilter) {
            modalTitleText += ` (Filtered by TECH ID: ${techIDFilter})`;
        }
        viewDataModalTitle.textContent = modalTitleText;

        viewDataSpinner.style.display = 'none';
        M.Modal.getInstance(viewDataModal).open();
    }, 50);
}

function viewProjectData() {
    const selectedProjectName = projectSelector.value;
    if (!selectedProjectName) {
        showToast('Please select a project to view data.', 'orange');
        return;
    }

    if (!activeProjectData || !activeProjectData.data) {
        showToast('No data loaded for the selected project.', 'orange');
        return;
    }

    displayDataTableInModal(activeProjectData.data);
}

function getBonusPercentage(qualityPercentage) {
    if (qualityPercentage < 77.50) return 0;
    if (qualityPercentage >= 100.00) return 120;

    const bonusTiers = [
        { quality: 77.50, bonus: 5 }, { quality: 78.00, bonus: 10 }, { quality: 78.50, bonus: 15 },
        { quality: 79.00, bonus: 20 }, { quality: 79.50, bonus: 25 }, { quality: 80.00, bonus: 30 },
        { quality: 80.50, bonus: 35 }, { quality: 81.00, bonus: 40 }, { quality: 81.50, bonus: 45 },
        { quality: 82.00, bonus: 50 }, { quality: 82.50, bonus: 55 }, { quality: 83.00, bonus: 57 },
        { quality: 83.50, bonus: 60 }, { quality: 84.00, bonus: 62 }, { quality: 84.50, bonus: 64 },
        { quality: 85.00, bonus: 66 }, { quality: 85.50, bonus: 68 }, { quality: 86.00, bonus: 70 },
        { quality: 86.50, bonus: 73 }, { quality: 87.00, bonus: 75 }, { quality: 87.50, bonus: 78 },
        { quality: 88.00, bonus: 80 }, { quality: 88.50, bonus: 83 }, { quality: 89.00, bonus: 85 },
        { quality: 89.50, bonus: 87 }, { quality: 90.00, bonus: 88 }, { quality: 90.50, bonus: 90 },
        { quality: 91.00, bonus: 91 }, { quality: 91.50, bonus: 93 }, { quality: 92.00, bonus: 94 },
        { quality: 92.50, bonus: 95 }, { quality: 93.00, bonus: 96 }, { quality: 93.50, bonus: 97 },
        { quality: 94.00, bonus: 98 }, { quality: 94.50, bonus: 99 }, { quality: 95.00, bonus: 100 },
        { quality: 95.50, bonus: 102 }, { quality: 96.00, bonus: 104 }, { quality: 96.50, bonus: 106 },
        { quality: 97.00, bonus: 108 }, { quality: 97.50, bonus: 110 }, { quality: 98.00, bonus: 112 },
        { quality: 98.50, bonus: 114 }, { quality: 99.00, bonus: 116 }, { quality: 99.50, bonus: 118 }
    ];

    for (let i = bonusTiers.length - 1; i >= 0; i--) {
        if (qualityPercentage >= bonusTiers[i].quality) {
            return bonusTiers[i].bonus;
        }
    }
    return 0;
}

function calculateRowDetails(fields, headers, size, ir) {
    const indexes = {
        category: headers.indexOf("CATEGORY"),
        i3qa: headers.indexOf("I3QA_CAT"),
        rv1cat: headers.indexOf("RV1_CAT"),
        afp1cat: headers.indexOf("AFP1_CAT"),
        rv1label: headers.indexOf("RV1_LABEL"),
        i3qalabel: headers.indexOf("I3QA_LABEL"),
        afp2cat: headers.indexOf("AFP2_CAT"),
        rv2cat: headers.indexOf("RV2_CAT")
    };

    let rowPoints = 0;
    let categoryCounts = Array(9).fill(0);
    let categoryPoints = Array(9).fill(0);

    [indexes.category, indexes.i3qa, indexes.rv1cat, indexes.afp1cat, indexes.afp2cat, indexes.rv2cat].forEach(idx => {
        if (idx !== -1 && fields[idx]) {
            const val = parseInt(fields[idx].trim());
            if (!isNaN(val) && val >= 1 && val <= 9) {
                const price = PRICES[val - 1][size];
                let currentCategoryPoints = price;

                if (ir) {
                    currentCategoryPoints += 1.5;
                }
                
                rowPoints += currentCategoryPoints;
                categoryCounts[val - 1]++;
                categoryPoints[val - 1] += currentCategoryPoints;
            }
        }
    });

    return { rowPoints, categoryCounts, categoryPoints };
}

function calculateDetailsForTechIDInRaw(raw, techIDValue, size, ir) {
    const rows = String(raw).split(/\r?\n/).filter(r => r.trim() !== "");
    const headers = rows.shift()?.split(/[\t,]/).map(h => h.trim().toUpperCase()) || [];
    const indexes = {
        fixId: headers.indexOf("FIX1_ID"),
        afp1stat: headers.indexOf("AFP1_STAT"),
        rv1label: headers.indexOf("RV1_LABEL"),
        i3qalabel: headers.indexOf("I3QA_LABEL"),
        rv2label: headers.indexOf("RV2_LABEL"),
        category: headers.indexOf("CATEGORY"),
        i3qa: headers.indexOf("I3QA_CAT"),
        rv1cat: headers.indexOf("RV1_CAT"),
        afp1cat: headers.indexOf("AFP1_CAT"),
        afp2cat: headers.indexOf("AFP2_CAT"),
        rv2cat: headers.indexOf("RV2_CAT")
    };

    if (indexes.fixId === -1) {
        return null;
    }

    let totalPoints = 0;
    let additionalFixPoints = 0;
    let excessiveFixPoints = 0;
    let missFixPoints = 0;
    let incorrectCounting = 0;
    let incorrectPointsValue = 0;
    const categoryPointsData = Array(9).fill(0); // Renamed to avoid conflict
    const categoryCountsData = Array(9).fill(0); // Renamed to avoid conflict

    const matched = rows.filter(row => {
        const fields = row.split(/[\t,]/);
        return fields[indexes.fixId]?.trim().toUpperCase() === techIDValue;
    });

    matched.forEach(row => {
        const fields = row.split(/[\t,]/);
        
        if (indexes.rv1label !== -1 && fields[indexes.rv1label]) {
            if (fields[indexes.rv1label].toUpperCase().includes("E")) excessiveFixPoints++;
            if (fields[indexes.rv1label].toUpperCase().includes("M")) missFixPoints++;
            if (fields[indexes.rv1label].toUpperCase().includes("I")) incorrectCounting++;
        }
        if (indexes.i3qalabel !== -1 && fields[indexes.i3qalabel]) {
            if (fields[indexes.i3qalabel].toUpperCase().includes("M")) missFixPoints++;
        }
        if (indexes.rv2label !== -1 && fields[indexes.rv2label]) {
            if (fields[indexes.rv2label].toUpperCase().includes("E")) excessiveFixPoints++;
            if (fields[indexes.rv2label].toUpperCase().includes("M")) missFixPoints++;
            if (fields[indexes.rv2label].toUpperCase().includes("I")) incorrectCounting++;
        }

        if (indexes.afp1stat !== -1 && fields[indexes.afp1stat] && fields[indexes.afp1stat].toUpperCase() === "AA") {
            additionalFixPoints++;
        }

        const rowDetails = calculateRowDetails(fields, headers, size, ir);
        totalPoints += rowDetails.rowPoints;
        rowDetails.categoryCounts.forEach((count, index) => categoryCountsData[index] += count);
        rowDetails.categoryPoints.forEach((points, index) => categoryPointsData[index] += points);
        
        if (indexes.rv1label !== -1 && fields[indexes.rv1label]?.toUpperCase().includes("I")) {
            const rv1CatValue = parseInt(fields[indexes.rv1cat]?.trim());
            if (indexes.rv1cat !== -1 && !isNaN(rv1CatValue) && rv1CatValue >= 1 && rv1CatValue <= 9) {
                const basePrice = PRICES[rv1CatValue - 1][size];
                if (basePrice !== undefined && !isNaN(basePrice)) {
                    let pointsForThisIncorrectCat = basePrice;
                    if (ir) {
                        pointsForThisIncorrectCat += 1.5;
                    }
                    incorrectPointsValue += pointsForThisIncorrectCat;
                }
            }
        }
        if (indexes.rv2label !== -1 && fields[indexes.rv2label]?.toUpperCase().includes("I")) {
            const rv2CatValue = parseInt(fields[indexes.rv2cat]?.trim());
            if (indexes.rv2cat !== -1 && !isNaN(rv2CatValue) && rv2CatValue >= 1 && rv2CatValue <= 9) {
                const basePrice = PRICES[rv2CatValue - 1][size];
                if (basePrice !== undefined && !isNaN(basePrice)) {
                    let pointsForThisIncorrectCat = basePrice;
                    if (ir) {
                        pointsForThisIncorrectCat += 1.5;
                    }
                    incorrectPointsValue += pointsForThisIncorrectCat;
                }
            }
        }
    });

    const correctPoints = totalPoints - incorrectPointsValue;
    const qualityPercentage = (totalPoints > 0) ? (correctPoints / totalPoints) * 100 : 0;
    const bonusPercentageVal = getBonusPercentage(qualityPercentage); // Renamed
    const qualityBonus = totalPoints * (bonusPercentageVal / 100);
    const estimatedSalary = totalPoints + qualityBonus;

    return {
        techID: techIDValue,
        totalPoints: totalPoints,
        additionalFixPoints: additionalFixPoints,
        excessiveFixPoints: excessiveFixPoints,
        missFixPoints: missFixPoints,
        incorrectCounting: incorrectCounting,
        incorrectPointsValue: incorrectPointsValue,
        qualityPercentage: qualityPercentage,
        bonusPercentage: bonusPercentageVal,
        qualityBonus: qualityBonus,
        estimatedSalary: estimatedSalary,
        categoryPoints: categoryPointsData,
        categoryCounts: categoryCountsData
    };
}

// --- Main Functions ---
function saveProject() {
    const name = projectNameInput.value.trim();
    const data = rawDataInput.value.trim();
    const size = modalSizeSelect.value;
    const ir = modalIrCheck.checked;

    if (!name || !data) {
        showToast('Please enter a project name and data.', 'red');
        return;
    }

    const payload = JSON.stringify({ data, size, ir });
    const storageKey = `tl_project_${name}`;

    if (editingProjectName && editingProjectName !== name) {
        localStorage.removeItem(`tl_project_${editingProjectName}`);
    }

    if (safeSetLocalStorage(storageKey, payload)) {
        showToast(`Project '${name}' saved!`, 'green');
        loadProjectList();
        M.Modal.getInstance(addProjectModal).close();
        projectNameInput.value = '';
        rawDataInput.value = '';
        modalSizeSelect.value = '3in';
        modalIrCheck.checked = false;
        M.FormSelect.init(modalSizeSelect);
        M.updateTextFields();
        editingProjectName = null;
    }
}

async function deleteSelectedProject() {
    const selected = projectSelector.value;
    if (!selected) {
        showToast('No project selected.', 'red');
        return;
    }

    const confirmed = await showCustomConfirm(`Are you sure you want to delete project '${selected}'?`, 'Delete Project');
    if (confirmed) {
        localStorage.removeItem(`tl_project_${selected}`);
        showToast(`Project '${selected}' deleted.`, 'orange');
        loadProjectList();
        activeProjectData = '';
        outputDiv.textContent = '';
        allResultsDiv.innerHTML = '';
        allCalculatedResults = [];
        lastResult = '';
        allProjectsAggregatedResults = {};
        editingProjectName = null;
    }
}

function searchTechID() {
    const raw = activeProjectData?.data;
    const techIDValue = techIdInput.value.trim().toUpperCase();
    const size = activeProjectData?.size;
    const ir = activeProjectData?.ir;

    outputDiv.innerHTML = '';
    allResultsDiv.innerHTML = '';
    lastResult = '';
    allCalculatedResults = [];
    allProjectsAggregatedResults = {};

    if (!raw || !techIDValue || !size) {
        outputDiv.innerHTML = '<p>Please load a project first and enter a TECH ID to search.</p>';
        addResultButtons(outputDiv);
        return;
    }

    const result = calculateDetailsForTechIDInRaw(raw, techIDValue, size, ir);

    if (result) {
        const techIdHighlightClass = result.techID.length < 6 ? 'tech-id-red-highlight' : 'tech-id-highlight';

        let outputHtml = `<h5>Search Results for TECH ID: <span class="${techIdHighlightClass}">${result.techID}</span></h5>`;
        outputHtml += `<p><strong>Project Total Points: ${result.totalPoints.toFixed(2)}</strong></p>`;
        outputHtml += '<table class="striped"><thead><tr>';
        outputHtml += '<th>Metric</th><th>Value</th><th>Count/N/A</th>';
        outputHtml += '</tr></thead><tbody>';

        result.categoryPoints.forEach((total, i) => {
            outputHtml += `<tr><td>CAT ${i + 1}</td><td>${total.toFixed(2)}</td><td>${result.categoryCounts[i]}</td></tr>`;
        });

        outputHtml += `<tr><td>Additional FixPoints</td><td>N/A</td><td>${result.additionalFixPoints}</td></tr>`;
        outputHtml += `<tr><td>Excessive FixPoints</td><td>N/A</td><td>${result.excessiveFixPoints}</td></tr>`;
        outputHtml += `<tr><td>Miss FixPoints</td><td>N/A</td><td>${result.missFixPoints}</td></tr>`;
        outputHtml += `<tr><td>Incorrect Counting</td><td>N/A</td><td>${result.incorrectCounting}</td></tr>`;
        outputHtml += `<tr><td>Incorrect Points Value</td><td>${result.incorrectPointsValue.toFixed(2)}</td><td>N/A</td></tr>`;
        outputHtml += `<tr><td>Total Points</td><td>${result.totalPoints.toFixed(2)}</td><td>N/A</td></tr>`;
        outputHtml += `<tr><td>Quality Percentage</td><td>${result.qualityPercentage.toFixed(2)}%</td><td>N/A</td></tr>`;
        outputHtml += `<tr><td>Bonus Percentage</td><td>${result.bonusPercentage.toFixed(2)}%</td><td>N/A</td></tr>`;
        outputHtml += `<tr><td>Quality Bonus</td><td>${result.qualityBonus.toFixed(2)}</td><td>N/A</td></tr>`;
        outputHtml += `<tr><td class="salary-highlight">Estimated Salary</td><td class="salary-highlight">${result.estimatedSalary.toFixed(2)}</td><td class="salary-highlight">N/A</td></tr>`;
        outputHtml += '</tbody></table>';

        outputDiv.innerHTML = outputHtml;
        lastResult = result;
    } else {
        outputDiv.innerHTML = `<p>TECH ID '${techIDValue}' not found or error in data in the loaded project.</p>`;
    }
    addResultButtons(outputDiv);
}

function calculateAllTechIDs() {
    const raw = activeProjectData?.data;
    const size = activeProjectData?.size;
    const ir = activeProjectData?.ir;

    if (!raw || !size) {
        allResultsDiv.innerHTML = '<p>Please load a project first.</p>';
        allCalculatedResults = [];
        allProjectsAggregatedResults = {};
        addResultButtons(allResultsDiv);
        return;
    }

    const rows = String(raw).split(/\r?\n/).filter(r => r.trim() !== "");
    const headers = rows.shift()?.split(/[\t,]/).map(h => h.trim().toUpperCase()) || [];
    const fixIdIndex = headers.indexOf("FIX1_ID");

    if (fixIdIndex === -1) {
        allResultsDiv.innerHTML = '<p>Error: FIX1_ID column not found in the loaded project.</p>';
        allCalculatedResults = [];
        allProjectsAggregatedResults = {};
        addResultButtons(allResultsDiv);
        return;
    }

    const techIDs = new Set();
    rows.forEach(row => {
        const fields = row.split(/[\t,]/);
        const techID = fields[fixIdIndex]?.trim().toUpperCase();
        if (techID) {
            techIDs.add(techID);
        }
    });

    allCalculatedResults = [];
    let tableHtml = '<table class="striped"><thead><tr>';

    const tableHeaders = [
        'TECH ID',
        ...Array.from({ length: 9 }, (_, i) => `CAT ${i + 1} Points`),
        ...Array.from({ length: 9 }, (_, i) => `CAT ${i + 1} Count`),
        'Additional FixPoints', 'Excessive FixPoints', 'Miss FixPoints', 'Incorrect Counting', 'Incorrect Points Value',
        'Total Points',
        'Quality %', 'Bonus %',
        'Quality Bonus', 'Estimated Salary'
    ];

    tableHeaders.forEach(headerText => {
        tableHtml += `<th>${headerText}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    techIDs.forEach(techID => {
        const result = calculateDetailsForTechIDInRaw(raw, techID, size, ir);
        if (result) {
            allCalculatedResults.push(result);
            const qualityClass = result.qualityPercentage === 100 ? 'quality-green' : (result.qualityPercentage >= 77.50 ? 'quality-orange' : 'quality-red');
            const techIdHighlightClass = result.techID.length < 6 ? 'tech-id-red-highlight' : 'tech-id-highlight';

            let bonusClass = '';
            if (result.bonusPercentage >= 100) {
                bonusClass = 'quality-green';
            } else if (result.bonusPercentage > 0) {
                bonusClass = 'quality-orange';
            } else {
                bonusClass = 'quality-red';
            }

            tableHtml += '<tr>';
            tableHtml += `<td class="${techIdHighlightClass}">${techID}</td>`;
            result.categoryPoints.forEach(total => tableHtml += `<td>${total.toFixed(2)}</td>`);
            result.categoryCounts.forEach(count => tableHtml += `<td>${count}</td>`);
            tableHtml += `<td>${result.additionalFixPoints}</td>`;
            tableHtml += `<td>${result.excessiveFixPoints}</td>`;
            tableHtml += `<td>${result.missFixPoints}</td>`;
            tableHtml += `<td>${result.incorrectCounting}</td>`;
            tableHtml += `<td>${result.incorrectPointsValue.toFixed(2)}</td>`;
            tableHtml += `<td>${result.totalPoints.toFixed(2)}</td>`;
            tableHtml += `<td class="${qualityClass}">${result.qualityPercentage.toFixed(2)}%</td>`;
            tableHtml += `<td class="${bonusClass}">${result.bonusPercentage.toFixed(2)}%</td>`;
            tableHtml += `<td class="${bonusClass}">${result.qualityBonus.toFixed(2)}</td>`;
            tableHtml += `<td class="salary-highlight">${result.estimatedSalary.toFixed(2)}</td>`;
            tableHtml += '</tr>';
        }
    });
    tableHtml += '</tbody></table>';

    allResultsDiv.innerHTML = `<h5>Results for Loaded Project</h5>${tableHtml}`;
    outputDiv.textContent = '';
    allProjectsAggregatedResults = {};
    addResultButtons(allResultsDiv);
}

function calculateTotalAcrossAllProjects() {
    const multiplier = parseFloat(multiplierInput.value) || 1;
    allProjectsAggregatedResults = {};
    let processingErrors = [];

    const allProjectsRawData = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('tl_project_')) {
            const projectName = key.replace('tl_project_', '');
            const projectDataString = safeGetLocalStorage(key);
            if (projectDataString !== null) {
                try {
                    const project = JSON.parse(projectDataString);
                    if (project && typeof project === 'object' && 'data' in project && 'size' in project && 'ir' in project) {
                        allProjectsRawData.push({
                            name: projectName,
                            data: String(project.data),
                            size: project.size,
                            ir: project.ir
                        });
                    } else {
                        processingErrors.push(`Project '${projectName}': Invalid project data structure.`);
                    }
                } catch (e) {
                    processingErrors.push(`Project '${projectName}': Error processing data - ${e.message}`);
                    console.error(`Error processing project '${projectName}':`, e);
                }
            } else {
                processingErrors.push(`Project '${projectName}': Could not retrieve data.`);
            }
        }
    }

    const allUniqueTechIDs = new Set();
    allProjectsRawData.forEach(project => {
        const rows = project.data.split(/\r?\n/).filter(r => r.trim() !== "");
        if (rows.length > 0) {
            const headerRow = rows.shift();
            const headers = headerRow.split(/[\t,]/).map(h => h.trim().toUpperCase());
            const fixIdIndex = headers.indexOf("FIX1_ID");
            if (fixIdIndex === -1) return;
            rows.forEach(row => {
                const fields = row.split(/[\t,]/);
                const techID = fields[fixIdIndex]?.trim().toUpperCase();
                if (techID) allUniqueTechIDs.add(techID);
            });
        }
    });

    allUniqueTechIDs.forEach(techID => {
        allProjectsAggregatedResults[techID] = {
            baseTotalPoints: 0, incorrectPointsValue: 0, additionalFixPoints: 0,
            excessiveFixPoints: 0, missFixPoints: 0, incorrectCounting: 0,
            categoryPoints: Array(9).fill(0), categoryCounts: Array(9).fill(0),
            totalPoints: 0, qualityPercentage: 0, bonusPercentage: 0,
            qualityBonus: 0, estimatedSalary: 0
        };

        allProjectsRawData.forEach(project => {
            const projectSpecificResult = calculateDetailsForTechIDInRaw(project.data, techID, project.size, project.ir);
            if (projectSpecificResult) {
                allProjectsAggregatedResults[techID].baseTotalPoints += projectSpecificResult.totalPoints;
                allProjectsAggregatedResults[techID].incorrectPointsValue += projectSpecificResult.incorrectPointsValue;
                allProjectsAggregatedResults[techID].additionalFixPoints += projectSpecificResult.additionalFixPoints;
                allProjectsAggregatedResults[techID].excessiveFixPoints += projectSpecificResult.excessiveFixPoints;
                allProjectsAggregatedResults[techID].missFixPoints += projectSpecificResult.missFixPoints;
                allProjectsAggregatedResults[techID].incorrectCounting += projectSpecificResult.incorrectCounting;
                projectSpecificResult.categoryPoints.forEach((points, index) => allProjectsAggregatedResults[techID].categoryPoints[index] += points);
                projectSpecificResult.categoryCounts.forEach((count, index) => allProjectsAggregatedResults[techID].categoryCounts[index] += count);
            }
        });

        const aggregatedResult = allProjectsAggregatedResults[techID];
        aggregatedResult.totalPoints = aggregatedResult.baseTotalPoints * multiplier;
        const correctPointsAggregated = aggregatedResult.baseTotalPoints - aggregatedResult.incorrectPointsValue;
        aggregatedResult.qualityPercentage = (aggregatedResult.baseTotalPoints > 0) ? (correctPointsAggregated / aggregatedResult.baseTotalPoints) * 100 : 0;
        aggregatedResult.bonusPercentage = getBonusPercentage(aggregatedResult.qualityPercentage);
        aggregatedResult.qualityBonus = aggregatedResult.baseTotalPoints * (aggregatedResult.bonusPercentage / 100);
        aggregatedResult.estimatedSalary = aggregatedResult.totalPoints + aggregatedResult.qualityBonus;
    });

    let grandTotal = 0;
    Object.values(allProjectsAggregatedResults).forEach(result => grandTotal += result.totalPoints);

    let tableHtml = `<h5>Totals Across All Projects (Multiplier: ${multiplier.toFixed(2)})</h5>`;
    if (Object.keys(allProjectsAggregatedResults).length === 0) {
        tableHtml += '<p>No TECH IDs found across all projects.</p>';
    } else {
        tableHtml += '<table class="striped"><thead><tr>';
        const aggregatedHeaders = [
            'TECH ID', ...Array.from({ length: 9 }, (_, i) => `CAT ${i + 1} Points`),
            ...Array.from({ length: 9 }, (_, i) => `CAT ${i + 1} Count`),
            'Additional FixPoints', 'Excessive FixPoints', 'Miss FixPoints', 'Incorrect Counting', 'Incorrect Points Value',
            'Total Points (w/ Multiplier)', 'Quality %', 'Bonus %', 'Quality Bonus', 'Estimated Salary'
        ];
        aggregatedHeaders.forEach(headerText => tableHtml += `<th>${headerText}</th>`);
        tableHtml += '</tr></thead><tbody>';

        Object.entries(allProjectsAggregatedResults).sort((a, b) => a[0].localeCompare(b[0])).forEach(([techID, result]) => {
            const qualityClass = result.qualityPercentage === 100 ? 'quality-green' : (result.qualityPercentage >= 77.50 ? 'quality-orange' : 'quality-red');
            const techIdHighlightClass = techID.length < 6 ? 'tech-id-red-highlight' : 'tech-id-highlight';
            let bonusClass = result.bonusPercentage >= 100 ? 'quality-green' : (result.bonusPercentage > 0 ? 'quality-orange' : 'quality-red');

            tableHtml += '<tr>';
            tableHtml += `<td class="${techIdHighlightClass}">${techID}</td>`;
            result.categoryPoints.forEach(total => tableHtml += `<td>${total.toFixed(2)}</td>`);
            result.categoryCounts.forEach(count => tableHtml += `<td>${count}</td>`);
            tableHtml += `<td>${result.additionalFixPoints}</td><td>${result.excessiveFixPoints}</td>`;
            tableHtml += `<td>${result.missFixPoints}</td><td>${result.incorrectCounting}</td>`;
            tableHtml += `<td>${result.incorrectPointsValue.toFixed(2)}</td><td>${result.totalPoints.toFixed(2)}</td>`;
            tableHtml += `<td class="${qualityClass}">${result.qualityPercentage.toFixed(2)}%</td>`;
            tableHtml += `<td class="${bonusClass}">${result.bonusPercentage.toFixed(2)}%</td>`;
            tableHtml += `<td class="${bonusClass}">${result.qualityBonus.toFixed(2)}</td>`;
            tableHtml += `<td class="salary-highlight">${result.estimatedSalary.toFixed(2)}</td></tr>`;
        });
        tableHtml += '</tbody></table>';
        tableHtml += `<h4 style="margin-top: 20px;">Team Total Points: ${grandTotal.toFixed(2)} points</h4>`;
    }

    if (processingErrors.length > 0) {
        tableHtml += '<div class="card red lighten-5"><div class="card-content red-text text-darken-4"><span class="card-title">Processing Warnings/Errors</span><ul>';
        processingErrors.forEach(error => tableHtml += `<li>${error}</li>`);
        tableHtml += '</ul></div></div>';
    }

    allResultsDiv.innerHTML = tableHtml;
    outputDiv.textContent = '';
    allCalculatedResults = [];
    addResultButtons(allResultsDiv);
    M.Modal.getInstance(document.getElementById('multiplier-modal')).close();
}

function exportToCsv(filename, data) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        showToast('No data to export.', 'red');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    let headers = [];

    if (Array.isArray(data)) {
        headers = [
            'TECH ID', ...Array.from({ length: 9 }, (_, i) => `CAT ${i + 1} Points`),
            ...Array.from({ length: 9 }, (_, i) => `CAT ${i + 1} Count`),
            'Additional FixPoints', 'Excessive FixPoints', 'Miss FixPoints', 'Incorrect Counting', 'Incorrect Points Value',
            'Total Points (w/ Multiplier)', 'Quality %', 'Bonus %', 'Quality Bonus', 'Estimated Salary'
        ];
    } else {
        headers = ['Metric', 'Value', 'Count/N/A'];
    }

    csvContent += headers.join(",") + "\n";

    if (Array.isArray(data)) {
        data.forEach(item => {
            let row = [
                item.techID, ...item.categoryPoints.map(p => p.toFixed(2)),
                ...item.categoryCounts, item.additionalFixPoints, item.excessiveFixPoints,
                item.missFixPoints, item.incorrectCounting, item.incorrectPointsValue.toFixed(2),
                item.totalPoints.toFixed(2), item.qualityPercentage.toFixed(2) + '%',
                item.bonusPercentage.toFixed(2) + '%', item.qualityBonus.toFixed(2),
                item.estimatedSalary.toFixed(2)
            ];
            csvContent += row.join(",") + "\n";
        });
    } else { 
        csvContent += `"Total Points",${data.totalPoints.toFixed(2)},N/A\n`;
        data.categoryPoints.forEach((total, i) => {
            csvContent += `"CAT ${i + 1}",${total.toFixed(2)},${data.categoryCounts[i]}\n`;
        });
        csvContent += `"Additional FixPoints",N/A,${data.additionalFixPoints}\n`;
        csvContent += `"Excessive FixPoints",N/A,${data.excessiveFixPoints}\n`;
        csvContent += `"Miss FixPoints",N/A,${data.missFixPoints}\n`;
        csvContent += `"Incorrect Counting",N/A,${data.incorrectCounting}\n`;
        csvContent += `"Incorrect Points Value",${data.incorrectPointsValue.toFixed(2)},N/A\n`;
        csvContent += `"Quality Percentage",${data.qualityPercentage.toFixed(2)}%,N/A\n`;
        csvContent += `"Bonus Percentage",${data.bonusPercentage.toFixed(2)}%,N/A\n`;
        csvContent += `"Quality Bonus",${data.qualityBonus.toFixed(2)},N/A\n`;
        csvContent += `"Estimated Salary",${data.estimatedSalary.toFixed(2)},N/A\n`;
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV exported successfully!', 'green');
}

async function autoFetchExternalJson() {
    showLoader();
    showToast('Attempting to update projects online...', 'blue');
    try {
        const response = await fetch(HARDCODED_PROJECTS_JSON_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const compressedText = await response.text();
        const decompressedText = LZString.decompressFromBase64(compressedText);
        if (decompressedText === null) throw new Error("Decompression failed.");

        const externalProjects = JSON.parse(decompressedText);
        if (!Array.isArray(externalProjects)) throw new Error("External JSON is not an array.");

        let updatedCount = 0, addedCount = 0;
        for (const project of externalProjects) {
            if (project.name && typeof project.data === 'object' && project.data !== null &&
                'data' in project.data && 'size' in project.data && 'ir' in project.data) {
                const storageKey = `tl_project_${project.name}`;
                const newPayload = JSON.stringify(project.data);
                const existingStoredString = safeGetLocalStorage(storageKey);
                let existingParsedData = null;
                if (existingStoredString) {
                    try { existingParsedData = JSON.parse(existingStoredString); }
                    catch (parseError) { console.warn(`Error parsing existing project '${project.name}' during auto-fetch:`, parseError); }
                }
                if (!existingParsedData || JSON.stringify(existingParsedData) !== newPayload) {
                    if (safeSetLocalStorage(storageKey, newPayload)) {
                        if (existingParsedData) updatedCount++; else addedCount++;
                    }
                }
            } else {
                console.warn("Skipping invalid project entry from online source:", project);
            }
        }
        loadProjectList();
        showToast(`Projects updated! Added: ${addedCount}, Updated: ${updatedCount}`, 'green');
    } catch (e) {
        showToast(`Failed to update projects: ${e.message}`, 'red');
        console.error("Auto-fetch error:", e);
    } finally {
        hideLoader();
    }
}

async function verifyTlLoginCode(enteredCode) {
    try {
        const response = await fetch(HARDCODED_TL_CODE_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const tlCodeData = await response.json();
        return tlCodeData.code === enteredCode;
    } catch (e) {
        showToast(`Error fetching TL login code: ${e.message}`, 'red');
        console.error("TL code fetch error:", e);
        return false;
    }
}

function updateButtonVisibility() {
    const tlButtons = [
        document.getElementById('add-project-button'),
        document.getElementById('edit-project'),
        document.getElementById('delete-project'),
        document.getElementById('copy-all-projects-json')
    ];

    tlButtons.forEach(button => {
        if (button) {
            button.style.display = isLoggedInAsTL ? 'inline-block' : 'none';
        }
    });

    const commonButtons = [
        'calculate-all-button', 'calculate-all-projects-button', 'export-button',
        'search-button', 'view-project-data-button', 'auto-fetch-external-json',
        'clear-data-button'
    ];
    commonButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = 'inline-block'; // Should be visible if they exist
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM elements that might not be immediately available
    // This ensures that elements are referenced after the DOM is fully loaded.
    // Note: Most const declarations for DOM elements are at the top, which is fine if script is deferred or at end of body.
    // This is more of a safeguard or a place to put initializations that must wait for DOM ready.

    const searchButton = document.getElementById('search-button');
    if (searchButton) searchButton.addEventListener('click', searchTechID);

    const calculateAllButton = document.getElementById('calculate-all-button');
    if (calculateAllButton) calculateAllButton.addEventListener('click', calculateAllTechIDs);

    const calculateAllProjectsButton = document.getElementById('calculate-all-projects-button');
    if (calculateAllProjectsButton) {
        calculateAllProjectsButton.addEventListener('click', () => {
            const multiplierModalInstance = M.Modal.getInstance(document.getElementById('multiplier-modal'));
            if (multiplierModalInstance) multiplierModalInstance.open();
        });
    }
    
    if (applyMultiplierButton) applyMultiplierButton.addEventListener('click', calculateTotalAcrossAllProjects);

    if (projectSelector) {
        projectSelector.addEventListener('change', () => {
            const selectedProjectName = projectSelector.value;
            const projectDataString = safeGetLocalStorage(`tl_project_${selectedProjectName}`);

            if (projectDataString) {
                try {
                    activeProjectData = JSON.parse(projectDataString);
                    showToast(`Project '${selectedProjectName}' loaded.`, 'blue');
                    outputDiv.textContent = ''; allResultsDiv.innerHTML = '';
                    lastResult = ''; allCalculatedResults = []; allProjectsAggregatedResults = {};
                    if (isLoggedInAsTL) { // Check if logged in as TL to prefill edit fields
                        const currentProjectNameInput = document.getElementById('project-name'); // Re-fetch in case of dynamic changes
                        const currentRawDataInput = document.getElementById('raw-data');
                        const currentModalSizeSelect = document.getElementById('modal-size');
                        const currentModalIrCheck = document.getElementById('modal-ir-check');

                        if(currentProjectNameInput) currentProjectNameInput.value = selectedProjectName;
                        if(currentRawDataInput) currentRawDataInput.value = activeProjectData.data;
                        if(currentModalSizeSelect) currentModalSizeSelect.value = activeProjectData.size;
                        if(currentModalIrCheck) currentModalIrCheck.checked = activeProjectData.ir;
                        M.updateTextFields(); 
                        if(currentModalSizeSelect) M.FormSelect.init(currentModalSizeSelect);
                        editingProjectName = selectedProjectName;
                    }
                } catch (e) {
                    showToast(`Error parsing project data for '${selectedProjectName}'.`, 'red');
                    console.error("Project data parse error:", e); activeProjectData = '';
                }
            } else {
                activeProjectData = ''; outputDiv.textContent = ''; allResultsDiv.innerHTML = '';
                lastResult = ''; allCalculatedResults = []; allProjectsAggregatedResults = {};
                if (isLoggedInAsTL) { // Reset edit fields if no project data found
                    const currentProjectNameInput = document.getElementById('project-name');
                    const currentRawDataInput = document.getElementById('raw-data');
                    const currentModalSizeSelect = document.getElementById('modal-size');
                    const currentModalIrCheck = document.getElementById('modal-ir-check');

                    if(currentProjectNameInput) currentProjectNameInput.value = '';
                    if(currentRawDataInput) currentRawDataInput.value = '';
                    if(currentModalSizeSelect) currentModalSizeSelect.value = '3in';
                    if(currentModalIrCheck) currentModalIrCheck.checked = false;
                    M.updateTextFields(); 
                    if(currentModalSizeSelect) M.FormSelect.init(currentModalSizeSelect);
                }
                editingProjectName = null;
            }
        });
    }

    const editProjectButton = document.getElementById('edit-project');
    if (editProjectButton) {
        editProjectButton.addEventListener('click', () => {
            const selectedProjectName = projectSelector.value;
            if (!selectedProjectName) {
                showToast('Please select a project to edit.', 'red'); return;
            }
            const projectDataString = safeGetLocalStorage(`tl_project_${selectedProjectName}`);
            if (projectDataString) {
                try {
                    const project = JSON.parse(projectDataString);
                    // Re-fetch modal elements to ensure they are current
                    const currentProjectNameInput = document.getElementById('project-name');
                    const currentRawDataInput = document.getElementById('raw-data');
                    const currentModalSizeSelect = document.getElementById('modal-size');
                    const currentModalIrCheck = document.getElementById('modal-ir-check');
                    const currentModalTitle = document.getElementById('modal-title');
                    const currentSaveProjectModalButton = document.getElementById('save-project-modal-button');


                    if(currentProjectNameInput) currentProjectNameInput.value = selectedProjectName;
                    if(currentRawDataInput) currentRawDataInput.value = project.data;
                    if(currentModalSizeSelect) currentModalSizeSelect.value = project.size;
                    if(currentModalIrCheck) currentModalIrCheck.checked = project.ir;
                    M.updateTextFields(); 
                    if(currentModalSizeSelect) M.FormSelect.init(currentModalSizeSelect);
                    if(currentModalTitle) currentModalTitle.textContent = 'Edit Project';
                    if(currentSaveProjectModalButton) currentSaveProjectModalButton.textContent = 'Update Project';
                    editingProjectName = selectedProjectName;
                    const addProjectModalInstance = M.Modal.getInstance(addProjectModal);
                    if (addProjectModalInstance) addProjectModalInstance.open();

                } catch (e) {
                     showToast(`Error loading project data for editing '${selectedProjectName}'.`, 'red');
                     console.error("Edit project data load error:", e);
                }
            } else {
                showToast('Error: Could not load project data for editing.', 'red');
            }
        });
    }
    
    const deleteProjectButton = document.getElementById('delete-project');
    if (deleteProjectButton) deleteProjectButton.addEventListener('click', deleteSelectedProject);

    if (addProjectButton) {
        addProjectButton.addEventListener('click', () => {
            const currentModalTitle = document.getElementById('modal-title');
            const currentSaveProjectModalButton = document.getElementById('save-project-modal-button');
            const currentProjectNameInput = document.getElementById('project-name');
            const currentRawDataInput = document.getElementById('raw-data');
            const currentModalSizeSelect = document.getElementById('modal-size');
            const currentModalIrCheck = document.getElementById('modal-ir-check');

            if(currentModalTitle) currentModalTitle.textContent = 'Add New Project';
            if(currentSaveProjectModalButton) currentSaveProjectModalButton.textContent = 'Save Project';
            if(currentProjectNameInput) currentProjectNameInput.value = ''; 
            if(currentRawDataInput) currentRawDataInput.value = '';
            if(currentModalSizeSelect) currentModalSizeSelect.value = '3in'; 
            if(currentModalIrCheck) currentModalIrCheck.checked = false;
            M.updateTextFields(); 
            if(currentModalSizeSelect) M.FormSelect.init(currentModalSizeSelect);
            editingProjectName = null;
            // M.Modal.getInstance(addProjectModal).open(); // Already a modal trigger
        });
    }

    if (saveProjectModalButton) saveProjectModalButton.addEventListener('click', saveProject);

    if (clearDataButton) {
        clearDataButton.addEventListener('click', async () => {
            const confirmed = await showCustomConfirm('Are you sure you want to clear ALL saved projects? This cannot be undone.', 'Clear All Data');
            if (confirmed) {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key.startsWith('tl_project_')) localStorage.removeItem(key);
                }
                loadProjectList(); activeProjectData = '';
                outputDiv.textContent = ''; allResultsDiv.innerHTML = '';
                allCalculatedResults = []; lastResult = ''; allProjectsAggregatedResults = {};
                showToast('All projects cleared!', 'green');
            }
        });
    }

    const exportButton = document.getElementById('export-button');
    if (exportButton) {
        exportButton.addEventListener('click', () => {
            if (Object.keys(allProjectsAggregatedResults).length > 0) {
                exportToCsv('all_projects_summary.csv', Object.values(allProjectsAggregatedResults));
            } else if (allCalculatedResults.length > 0) {
                exportToCsv('per_project_summary.csv', allCalculatedResults);
            } else if (lastResult) {
                exportToCsv(`tech_id_${lastResult.techID}_details.csv`, lastResult);
            } else {
                showToast('No results to export.', 'red');
            }
        });
    }

    const copyAllProjectsJsonButton = document.getElementById('copy-all-projects-json');
    if (copyAllProjectsJsonButton) {
        copyAllProjectsJsonButton.addEventListener('click', () => {
            const allProjectsDataForExport = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('tl_project_')) {
                    const projectName = key.replace('tl_project_', '');
                    const projectDataString = safeGetLocalStorage(key);
                    if (projectDataString !== null) {
                        try {
                            allProjectsDataForExport.push({ name: projectName, data: JSON.parse(projectDataString) });
                        } catch (e) {
                            console.error(`Error parsing project JSON for key ${key} during copy:`, e);
                            showToast(`Error copying project '${projectName}'.`, 'red');
                        }
                    }
                }
            }
            if (allProjectsDataForExport.length === 0) {
                showToast('No saved projects to copy.', 'orange'); return;
            }
            try {
                const compressed = LZString.compressToBase64(JSON.stringify(allProjectsDataForExport));
                navigator.clipboard.writeText(compressed)
                    .then(() => showToast('All project data (compressed) copied!', 'green'))
                    .catch(err => { showToast('Failed to copy.', 'red'); console.error('Copy fail: ', err); });
            } catch (e) {
                showToast('Compression error during copy.', 'red'); console.error('Copy compression error:', e);
            }
        });
    }

    if (autoFetchButton) autoFetchButton.addEventListener('click', autoFetchExternalJson);
    
    if (loginRoleSelect) {
        loginRoleSelect.addEventListener('change', () => {
            tlCodeInputDiv.style.display = loginRoleSelect.value === 'tl' ? 'block' : 'none';
            if (loginRoleSelect.value === 'tl') {
                if (tlLoginCodeInput) tlLoginCodeInput.setAttribute('required', 'required');
            } else {
                if (tlLoginCodeInput) tlLoginCodeInput.removeAttribute('required');
            }
            M.updateTextFields();
        });
    }

    if (loginButtonElement) {
        loginButtonElement.addEventListener('click', async () => {
            const selectedRole = loginRoleSelect.value;
            if (selectedRole === 'tl') {
                if (await verifyTlLoginCode(tlLoginCodeInput.value)) {
                    isLoggedInAsTL = true; showToast('Logged in as TL!', 'green');
                    M.Modal.getInstance(loginModal).close(); mainAppContent.style.display = 'block';
                    loadProjectList(); updateButtonVisibility();
                } else {
                    showToast('Incorrect TL code.', 'red'); isLoggedInAsTL = false;
                }
            } else if (selectedRole === 'tech') {
                isLoggedInAsTL = false; showToast('Logged in as Tech!', 'green');
                M.Modal.getInstance(loginModal).close(); mainAppContent.style.display = 'block';
                loadProjectList(); updateButtonVisibility();
            } else {
                 showToast('Please select a role.', 'orange');
            }
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            isLoggedInAsTL = false; showToast('Logged out.', 'blue');
            mainAppContent.style.display = 'none';
            outputDiv.textContent = ''; allResultsDiv.innerHTML = '';
            lastResult = ''; allCalculatedResults = []; allProjectsAggregatedResults = {};
            if (loginRoleSelect) loginRoleSelect.value = ''; 
            if (tlLoginCodeInput) tlLoginCodeInput.value = '';
            if (tlCodeInputDiv) tlCodeInputDiv.style.display = 'none';
            if (loginRoleSelect) M.FormSelect.init(loginRoleSelect); 
            M.updateTextFields();
            M.Modal.getInstance(loginModal).open();
        });
    }

    if (fullscreenCloseButton) {
        fullscreenCloseButton.addEventListener('click', hideFullscreenModal);
    }

    if (fullscreenResultsModal) {
        fullscreenResultsModal.addEventListener('click', (event) => {
            if (event.target === fullscreenResultsModal) hideFullscreenModal();
        });
    }
    
    if (viewProjectDataButton) {
         viewProjectDataButton.addEventListener('click', viewProjectData);
    }

    if(darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? 'disabled' : 'enabled');
            applyDarkModePreference();
        });
    }
    
    // --- Initialization ---
    document.body.style.display = 'none'; // Prevent FOUC
    applyDarkModePreference();

    M.Modal.init(document.querySelectorAll('.modal'), {
        dismissible: false, 
        onOpenEnd: (modalEl) => {
            if (modalEl.id === 'add-project-modal') {
                const rawDataTextArea = document.getElementById('raw-data');
                if(rawDataTextArea) M.textareaAutoResize(rawDataTextArea);
            }
        }
    });
    const loginModalInstance = M.Modal.getInstance(loginModal);
    if (loginModalInstance) {
        loginModalInstance.options.dismissible = false;
    }

    if (confirmationConfirmButton) {
        confirmationConfirmButton.addEventListener('click', () => {
            if (confirmPromiseResolve) { confirmPromiseResolve(true); confirmPromiseResolve = null; }
        });
    }
    if (confirmationCancelButton) {
        confirmationCancelButton.addEventListener('click', () => {
            if (confirmPromiseResolve) { confirmPromiseResolve(false); confirmPromiseResolve = null; }
        });
    }

    if (projectSelector) M.FormSelect.init(projectSelector);
    if (loginRoleSelect) M.FormSelect.init(loginRoleSelect);
    if (modalSizeSelect) M.FormSelect.init(modalSizeSelect);
    
    document.body.style.display = 'block';

    if (loginModalInstance) {
        loginModalInstance.open();
    } else {
        console.error("Login modal not found or not initialized by Materialize.");
        if (mainAppContent) mainAppContent.style.display = 'block';
        loadProjectList();
        updateButtonVisibility();
    }
});
