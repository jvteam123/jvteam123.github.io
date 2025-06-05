const firebaseConfig = {
    apiKey: "AIzaSyADB1W9YKaU6DFqGyjivsADJOhuIRY0eZ0", // Replace with your actual API key if different
    authDomain: "project-tracker-fddb1.firebaseapp.com",
    projectId: "project-tracker-fddb1",
    storageBucket: "project-tracker-fddb1.firebasestorage.app",
    messagingSenderId: "698282455986",
    appId: "1:698282455986:web:f31fa7830148dc47076aab",
    measurementId: "G-6D2Z9ZWEN1"
};

let app, db, auth;
let signInBtn, signOutBtn, userInfoDisplayDiv, userNameP, userEmailP, userPhotoImg;
let appContentDiv, loadingAuthMessageDiv, loadingOverlay;

const TL_DASHBOARD_PIN = "1234";
const ALLOWED_EMAILS_DOC_REF_PATH = "settings/allowedEmails";
let allowedEmailsFromFirestore = [];

const TECH_IDS = ["4232JD", "7248AA", "4426KV", "4472JS", "7236LE", "4475JT", "7039NO", "7231NR", "7240HH", "7247JA", "7249SS", "7244AA", "7314VP"];
TECH_IDS.sort();

try {
    if (typeof firebase === 'undefined' || typeof firebase.initializeApp === 'undefined') {
        throw new Error("Firebase SDK not loaded. Ensure Firebase scripts are correctly included.");
    }
    app = firebase.initializeApp(firebaseConfig);

    if (typeof app.firestore === 'undefined') {
        throw new Error("Firestore SDK not loaded or initialized correctly with the app.");
    }
    db = firebase.firestore();

    if (typeof app.auth === 'undefined') {
        throw new Error("Firebase Auth SDK not loaded or initialized correctly with the app.");
    }
    auth = firebase.auth();
    console.log("Firebase initialized successfully (App, Firestore, Auth)!");
    fetchAllowedEmails();
} catch (error) {
    console.error("CRITICAL: Error initializing Firebase: ", error.message);
    const loadingMessageElement = document.getElementById('loading-auth-message');
    if (loadingMessageElement) {
        loadingMessageElement.innerHTML = `<p style="color:red;">CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: ${error.message}</p>`;
    } else {
        alert("CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: " + error.message);
    }
}


const FIX_CATEGORIES_ORDER = ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"];
const STATUS_ORDER = {
    "Available": 1, "InProgressDay1": 2, "Day1Ended_AwaitingNext": 3,
    "InProgressDay2": 4, "Day2Ended_AwaitingNext": 5, "InProgressDay3": 6,
    "Day3Ended_AwaitingNext": 7, "Completed": 8, "Reassigned_TechAbsent": 9
};
const NUM_TABLE_COLUMNS = 15;

let openAddNewProjectBtn, openTlDashboardBtn, openSettingsBtn;
let projectFormModal, tlDashboardModal, settingsModal;
let closeProjectFormBtn, closeTlDashboardBtn, closeSettingsBtn;
let newProjectForm, projectTableBody, tlDashboardContentElement;
let allowedEmailsList, addEmailInput, addEmailBtn;
let tlSummaryModal, closeTlSummaryBtn, tlSummaryContent, openTlSummaryBtn;

let projects = [];
let groupVisibilityState = {};
let isAppInitialized = false;
let firestoreListenerUnsubscribe = null;

let batchIdSelect, fixCategoryFilter, monthFilter;
let currentSelectedBatchId = localStorage.getItem('currentSelectedBatchId') || ""; // Stores selected baseProjectName
let currentSelectedFixCategory = "";
let currentSelectedMonth = localStorage.getItem('currentSelectedMonth') || "";


function showLoading(message = "Loading...") {
    if (loadingOverlay) {
        const p = loadingOverlay.querySelector('p');
        if (p) p.textContent = message;
        loadingOverlay.style.display = 'flex';
    }
}
function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
function formatMillisToMinutes(millis) {
    if (millis === null || typeof millis !== 'number' || millis < 0) {
        return "N/A";
    }
    return Math.floor(millis / 60000);
}
function calculateDurationMs(startTime, finishTime) {
    let startMillis = startTime;
    let finishMillis = finishTime;
    if (startTime && typeof startTime.toMillis === 'function') startMillis = startTime.toMillis();
    if (finishTime && typeof finishTime.toMillis === 'function') finishMillis = finishTime.toMillis();
    else if (typeof startTime === 'number' && typeof finishTime === 'number') {}
    else if (startTime && typeof startTime.toMillis === 'function' && typeof finishTime === 'number') {}
    else if (typeof startTime === 'number' && finishTime && typeof finishTime.toMillis === 'function') {}
    else {
        if (startTime && !(typeof startTime === 'number') && !isNaN(new Date(startTime).getTime())) startMillis = new Date(startTime).getTime();
        if (finishTime && !(typeof finishTime === 'number') && !isNaN(new Date(finishTime).getTime())) finishMillis = new Date(finishTime).getTime();
    }
    if (!startMillis || !finishMillis || finishMillis < startMillis || isNaN(startMillis) || isNaN(finishMillis)) return null;
    return finishMillis - startMillis;
}
function loadGroupVisibilityState() {
    try {
        const storedState = localStorage.getItem('projectTrackerGroupVisibility');
        groupVisibilityState = storedState ? JSON.parse(storedState) : {};
    } catch (error) {
        console.error("Error parsing group visibility state from localStorage:", error);
        groupVisibilityState = {};
    }
}
function saveGroupVisibilityState() {
    try {
        localStorage.setItem('projectTrackerGroupVisibility', JSON.stringify(groupVisibilityState));
    } catch (error) {
        console.error("Error saving group visibility state to localStorage:", error);
        alert("Warning: Could not save your group visibility preferences.");
    }
}
async function fetchAllowedEmails() {
    showLoading("Fetching allowed emails...");
    if (!db) { console.error("Firestore (db) not initialized. Cannot fetch allowed emails."); hideLoading(); return; }
    try {
        const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
        const docSnap = await docRef.get(); // Requires 'async' on function
        if (docSnap.exists) allowedEmailsFromFirestore = docSnap.data().emails || [];
        else { console.warn(`Document ${ALLOWED_EMAILS_DOC_REF_PATH} does not exist. No emails loaded initially.`); allowedEmailsFromFirestore = ["ev.lorens.ebrado@gmail.com"]; }
    } catch (error) { console.error("Error fetching allowed emails:", error); allowedEmailsFromFirestore = ["ev.lorens.ebrado@gmail.com"]; }
    finally { hideLoading(); }
}
async function updateAllowedEmailsInFirestore(emailsArray) {
    showLoading("Updating allowed emails...");
    if (!db) { alert("Database not initialized! Cannot update allowed emails."); hideLoading(); return false; }
    const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
    try { await docRef.set({ emails: emailsArray }); allowedEmailsFromFirestore = emailsArray; return true; } // Requires 'async'
    catch (error) { console.error("Error updating allowed emails in Firestore:", error); alert("Error saving allowed emails. Error: " + error.message); return false; }
    finally { hideLoading(); }
}

async function initializeFirebaseAndLoadData() { // Ensure 'async' is here
    showLoading("Loading projects...");
    if (!db) {
        console.error("Firestore (db) not initialized. Cannot load project data.");
        projects = []; refreshAllViews(); hideLoading(); return;
    }
    if (firestoreListenerUnsubscribe) { firestoreListenerUnsubscribe(); firestoreListenerUnsubscribe = null; }
    loadGroupVisibilityState();

    let allProjectsForMonthFilterQuery = db.collection("projects").orderBy("creationTimestamp", "desc");
    try {
        const allProjectsSnapshot = await allProjectsForMonthFilterQuery.get(); // Requires 'async'
        const uniqueMonths = new Set();
        allProjectsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.creationTimestamp && data.creationTimestamp.toDate) {
                const date = data.creationTimestamp.toDate();
                const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                uniqueMonths.add(monthYear);
            }
        });
        if (monthFilter) {
            const preservedMonthValue = currentSelectedMonth;
            monthFilter.innerHTML = '<option value="">All Months</option>';
            Array.from(uniqueMonths).sort((a, b) => b.localeCompare(a)).forEach(monthYear => {
                const [year, month] = monthYear.split('-');
                const date = new Date(year, parseInt(month) - 1, 1);
                const option = document.createElement('option');
                option.value = monthYear;
                option.textContent = date.toLocaleString('en-US', { year: 'numeric', month: 'long' });
                monthFilter.appendChild(option);
            });
            if (preservedMonthValue && Array.from(uniqueMonths).includes(preservedMonthValue)) monthFilter.value = preservedMonthValue;
            else { monthFilter.value = ""; currentSelectedMonth = ""; localStorage.setItem('currentSelectedMonth', "");}
        }
    } catch (error) { console.error("Error populating month filter UI:", error); }

    let queryForProjectNames = db.collection("projects");
    try {
        const projectNamesSnapshot = await queryForProjectNames.get(); // Requires 'async'
        const uniqueBaseProjectNames = new Set();
        projectNamesSnapshot.forEach(doc => { if (doc.data().baseProjectName) uniqueBaseProjectNames.add(doc.data().baseProjectName); });
        const sortedBaseProjectNames = Array.from(uniqueBaseProjectNames).sort();
        if (batchIdSelect) {
            batchIdSelect.innerHTML = '';
            const allProjectsOption = document.createElement('option');
            allProjectsOption.value = ""; allProjectsOption.textContent = "All Projects";
            batchIdSelect.appendChild(allProjectsOption);
            sortedBaseProjectNames.forEach(projectName => { const option = document.createElement('option'); option.value = projectName; option.textContent = projectName; batchIdSelect.appendChild(option); });
            if (currentSelectedBatchId && (sortedBaseProjectNames.includes(currentSelectedBatchId) || currentSelectedBatchId === "")) batchIdSelect.value = currentSelectedBatchId;
            else { batchIdSelect.value = ""; currentSelectedBatchId = ""; localStorage.setItem('currentSelectedBatchId', ""); }
        }
    } catch (error) { console.error("Error populating project name filter:", error); if (batchIdSelect) batchIdSelect.innerHTML = '<option value="" disabled selected>Error loading projects</option>'; }

    let projectsQuery = db.collection("projects");
    if (currentSelectedBatchId && batchIdSelect && batchIdSelect.value !== "") {
        projectsQuery = projectsQuery.where("baseProjectName", "==", currentSelectedBatchId);
    }
    if (currentSelectedFixCategory && fixCategoryFilter && fixCategoryFilter.value) {
        projectsQuery = projectsQuery.where("fixCategory", "==", currentSelectedFixCategory);
    }
    projectsQuery = projectsQuery.orderBy("fixCategory").orderBy("areaTask");

    try {
        firestoreListenerUnsubscribe = projectsQuery.onSnapshot(snapshot => {
            const newProjects = [];
            snapshot.forEach(doc => { if (doc.exists && typeof doc.data === 'function') newProjects.push({ id: doc.id, ...doc.data() }); });
            projects = newProjects;
            projects.forEach(project => {
                 const groupKey = `${project.batchId}_${project.fixCategory}`;
                if (typeof groupVisibilityState[groupKey] === 'undefined') groupVisibilityState[groupKey] = { isExpanded: true };
                if (typeof project.breakDurationMinutes === 'undefined') project.breakDurationMinutes = 0;
                if (typeof project.additionalMinutesManual === 'undefined') project.additionalMinutesManual = 0;
                if (typeof project.startTimeDay3 === 'undefined') project.startTimeDay3 = null;
                if (typeof project.finishTimeDay3 === 'undefined') project.finishTimeDay3 = null;
                if (typeof project.durationDay3Ms === 'undefined') project.durationDay3Ms = null;
            });
            refreshAllViews();
        }, error => { console.error("Error fetching projects with onSnapshot: ", error); projects = []; refreshAllViews(); alert("Error loading projects: " + error.message); });
    } catch (error) { console.error("Error setting up Firebase listener (projectsQuery.onSnapshot): ", error); alert("CRITICAL ERROR: Could not set up real-time project updates. Error: " + error.message); }
    finally { hideLoading(); }
}

function setupDOMReferences() {
    openAddNewProjectBtn = document.getElementById('openAddNewProjectBtn'); openTlDashboardBtn = document.getElementById('openTlDashboardBtn'); openSettingsBtn = document.getElementById('openSettingsBtn'); openTlSummaryBtn = document.getElementById('openTlSummaryBtn');
    projectFormModal = document.getElementById('projectFormModal'); tlDashboardModal = document.getElementById('tlDashboardModal'); settingsModal = document.getElementById('settingsModal'); tlSummaryModal = document.getElementById('tlSummaryModal');
    closeProjectFormBtn = document.getElementById('closeProjectFormBtn'); closeTlDashboardBtn = document.getElementById('closeTlDashboardBtn'); closeSettingsBtn = document.getElementById('closeSettingsBtn'); closeTlSummaryBtn = document.getElementById('closeTlSummaryBtn');
    newProjectForm = document.getElementById('newProjectForm'); projectTableBody = document.getElementById('projectTableBody'); tlDashboardContentElement = document.getElementById('tlDashboardContent');
    allowedEmailsList = document.getElementById('allowedEmailsList'); addEmailInput = document.getElementById('addEmailInput'); addEmailBtn = document.getElementById('addEmailBtn'); tlSummaryContent = document.getElementById('tlSummaryContent');
    loadingOverlay = document.getElementById('loadingOverlay');
    batchIdSelect = document.getElementById('batchIdSelect'); fixCategoryFilter = document.getElementById('fixCategoryFilter'); monthFilter = document.getElementById('monthFilter');
}
function setupAuthRelatedDOMReferences() {
    signInBtn = document.getElementById('signInBtn'); signOutBtn = document.getElementById('signOutBtn'); userInfoDisplayDiv = document.getElementById('user-info-display');
    userNameP = document.getElementById('userName'); userEmailP = document.getElementById('userEmail'); userPhotoImg = document.getElementById('userPhoto');
    appContentDiv = document.getElementById('app-content'); loadingAuthMessageDiv = document.getElementById('loading-auth-message');
}

function attachEventListeners() {
    if (openAddNewProjectBtn) { openAddNewProjectBtn.onclick = () => { const pin = prompt("Enter PIN to add new tracker:"); if (pin !== TL_DASHBOARD_PIN) { alert("Incorrect PIN."); return; } if (projectFormModal) projectFormModal.style.display = 'block'; }; }
    if (openTlDashboardBtn) { openTlDashboardBtn.onclick = () => { const pin = prompt("Enter PIN to access Project Settings:"); if (pin === TL_DASHBOARD_PIN) { if (tlDashboardModal) tlDashboardModal.style.display = 'block'; renderTLDashboard(); } else { alert("Incorrect PIN."); } }; }
    if (openSettingsBtn) { openSettingsBtn.onclick = () => { const pin = prompt("Enter PIN to access User Settings:"); if (pin === TL_DASHBOARD_PIN) { if (settingsModal) settingsModal.style.display = 'block'; renderAllowedEmailsList(); } else { alert("Incorrect PIN."); } }; }
    if (openTlSummaryBtn) { openTlSummaryBtn.onclick = () => { if (tlSummaryModal) tlSummaryModal.style.display = 'block'; generateTlSummaryData(); }; }
    if (closeProjectFormBtn && projectFormModal && newProjectForm) { closeProjectFormBtn.onclick = () => { newProjectForm.reset(); projectFormModal.style.display = 'none'; }; }
    if (closeTlDashboardBtn && tlDashboardModal) { closeTlDashboardBtn.onclick = () => { tlDashboardModal.style.display = 'none'; }; }
    if (closeSettingsBtn && settingsModal) { closeSettingsBtn.onclick = () => { settingsModal.style.display = 'none'; }; }
    if (closeTlSummaryBtn && tlSummaryModal) { closeTlSummaryBtn.onclick = () => { tlSummaryModal.style.display = 'none'; }; }
    if (addEmailBtn) { addEmailBtn.onclick = handleAddEmail; }
    if (batchIdSelect) { batchIdSelect.onchange = (event) => { currentSelectedBatchId = event.target.value; localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId); initializeFirebaseAndLoadData(); }; }
    if (fixCategoryFilter) { fixCategoryFilter.onchange = (event) => { currentSelectedFixCategory = event.target.value; initializeFirebaseAndLoadData(); }; }
    if (monthFilter) {
        monthFilter.onchange = (event) => {
            currentSelectedMonth = event.target.value;
            localStorage.setItem('currentSelectedMonth', currentSelectedMonth);
            console.log("Month filter UI changed to: " + currentSelectedMonth + ". This does not filter the project list data.");
        };
    }
    if (typeof window !== 'undefined') { window.onclick = (event) => { if (projectFormModal && event.target == projectFormModal) projectFormModal.style.display = 'none'; if (tlDashboardModal && event.target == tlDashboardModal) tlDashboardModal.style.display = 'none'; if (settingsModal && event.target == settingsModal) settingsModal.style.display = 'none'; if (tlSummaryModal && event.target == tlSummaryModal) tlSummaryModal.style.display = 'none'; }; }
    if (newProjectForm) { newProjectForm.addEventListener('submit', handleAddProjectSubmit); }
    setupAuthEventListeners();
}
async function handleAddProjectSubmit(event) { // Ensure 'async'
    event.preventDefault(); showLoading("Adding project(s)..."); if (!db) { alert("Database not initialized!"); hideLoading(); return; }
    const fixCategory = document.getElementById('fixCategorySelect').value; const numRows = parseInt(document.getElementById('numRows').value, 10); const baseProjectName = document.getElementById('baseProjectName').value.trim(); const gsd = document.getElementById('gsd').value;
    if (!baseProjectName || isNaN(numRows) || numRows < 1) { alert("Invalid input. Please ensure Project Name is not empty and Number of Tasks is at least 1."); hideLoading(); return; }
    const batchId = `batch_${generateId()}`; const creationTimestamp = firebase.firestore.FieldValue.serverTimestamp(); const batchDb = db.batch();
    try {
        for (let i = 1; i <= numRows; i++) {
            const projectData = { batchId: batchId, creationTimestamp: creationTimestamp, fixCategory: fixCategory, baseProjectName: baseProjectName, areaTask: `Area${String(i).padStart(2, '0')}`, gsd: gsd, assignedTo: "", techNotes: "", status: "Available", startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null, startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null, startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null, releasedToNextStage: false, lastModifiedTimestamp: creationTimestamp, isReassigned: false, originalProjectId: null, breakDurationMinutes: 0, additionalMinutesManual: 0, };
            const newProjectRef = db.collection("projects").doc(); batchDb.set(newProjectRef, projectData);
        }
        await batchDb.commit(); // Requires 'async'
        if (newProjectForm) newProjectForm.reset();
        currentSelectedBatchId = baseProjectName; localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId);
        currentSelectedFixCategory = fixCategory; if (fixCategoryFilter) fixCategoryFilter.value = fixCategory;
        initializeFirebaseAndLoadData();
    } catch (error) { console.error("Error adding projects: ", error); alert("Error adding projects: " + error.message); }
    finally { if (projectFormModal) projectFormModal.style.display = 'none'; hideLoading(); }
}

async function getManageableBatches() { // Ensure 'async'
    if (!db) { console.error("DB not initialized for getManageableBatches."); return []; }
    showLoading("Loading batches for dashboard...");
    try {
        const projectsSnapshot = await db.collection("projects").get(); // Requires 'async'
        const batches = {};
        projectsSnapshot.forEach(doc => { /* ... */ });
        return Object.values(batches);
    } catch (error) { console.error("Error fetching batches for dashboard:", error); alert("Error fetching batches for dashboard: " + error.message); return []; }
    finally { hideLoading(); }
}
async function renderTLDashboard() { // Ensure 'async'
    if (!tlDashboardContentElement) { console.error("tlDashboardContentElement not found."); return; }
    tlDashboardContentElement.innerHTML = "";
    const batches = await getManageableBatches(); // Requires 'async'
    if (batches.length === 0) { tlDashboardContentElement.innerHTML = "<p>No project batches found for TL dashboard.</p>"; return; }
    batches.forEach(batch => { /* ... */ });
}
async function releaseBatchToNextFix(batchId, currentFixCategory, nextFixCategory) { // Ensure 'async'
    showLoading(`Releasing ${currentFixCategory} tasks...`); if (!db) { alert("Database not initialized!"); hideLoading(); return; }
    try {
        const querySnapshot = await db.collection("projects").where("batchId", "==", batchId).where("fixCategory", "==", currentFixCategory).where("releasedToNextStage", "==", false).get(); // Requires 'async'
        /* ... */
        const existingNextFixQuery = await db.collection("projects").where("batchId", "==", task.batchId).where("areaTask", "==", task.areaTask").where("fixCategory", "==", nextFixCategory").limit(1).get(); // Requires 'async'
        /* ... */
        await firestoreBatch.commit(); // Requires 'async'
        initializeFirebaseAndLoadData();
    } catch (error) { console.error("Error releasing batch:", error); alert("Error releasing batch: " + error.message); }
    finally { hideLoading(); }
}
async function deleteProjectBatch(batchId) { // Ensure 'async'
    showLoading("Deleting batch..."); if (!db || !batchId) { alert("Invalid request to delete batch."); hideLoading(); return; }
    try {
        const querySnapshot = await db.collection("projects").where("batchId", "==", batchId).get(); // Requires 'async'
        /* ... */
        await batchDb.commit(); // Requires 'async'
        initializeFirebaseAndLoadData(); renderTLDashboard();
    } catch (error) { console.error(`Error deleting batch ${batchId}:`, error); alert("Error deleting batch: " + error.message); }
    finally { hideLoading(); }
}
async function deleteSpecificFixTasksForBatch(batchId, fixCategory) { // Ensure 'async'
    showLoading(`Deleting ${fixCategory} tasks...`); if (!db || !batchId || !fixCategory) { alert("Invalid request to delete specific fix tasks."); hideLoading(); return; }
    try {
        const querySnapshot = await db.collection("projects").where("batchId", "==", batchId).where("fixCategory", "==", fixCategory).get(); // Requires 'async'
        /* ... */
        await batchDb.commit(); // Requires 'async'
        initializeFirebaseAndLoadData(); renderTLDashboard();
    } catch (error) { console.error(`Error deleting ${fixCategory} for batch ${batchId}:`, error); alert("Error deleting specific fix tasks: " + error.message); }
    finally { hideLoading(); }
}

function renderProjects() {
    if (!projectTableBody) { console.error("CRITICAL: projectTableBody not found."); return; }
    projectTableBody.innerHTML = "";
    const sortedProjects = [...projects];
    sortedProjects.sort((a, b) => {
        if (!a || !b) return 0;
        if (currentSelectedBatchId === "") { const projectNameA = a.baseProjectName || ""; const projectNameB = b.baseProjectName || ""; if (projectNameA < projectNameB) return -1; if (projectNameA > projectNameB) return 1; }
        const fixCategoryIndexA = FIX_CATEGORIES_ORDER.indexOf(a.fixCategory || ""); const fixCategoryIndexB = FIX_CATEGORIES_ORDER.indexOf(b.fixCategory || ""); if (fixCategoryIndexA < fixCategoryIndexB) return -1; if (fixCategoryIndexA > fixCategoryIndexB) return 1;
        const areaTaskA = a.areaTask || ""; const areaTaskB = b.areaTask || ""; if (areaTaskA < areaTaskB) return -1; if (areaTaskA > areaTaskB) return 1;
        const statusOrderA = STATUS_ORDER[a.status || ""] || 99; const statusOrderB = STATUS_ORDER[b.status || ""] || 99; if (statusOrderA < statusOrderB) return -1; if (statusOrderA > statusOrderB) return 1;
        return 0;
    });

    if (currentSelectedBatchId !== "") { // A specific project name is selected
        let currentFixCategoryHeader = null;
        sortedProjects.forEach(project => {
            if (!project || !project.id || !project.fixCategory ) { return; }
            if (project.fixCategory !== currentFixCategoryHeader) {
                currentFixCategoryHeader = project.fixCategory;
                const groupKey = `${project.baseProjectName}_${currentFixCategoryHeader}`;
                if (typeof groupVisibilityState[groupKey] === 'undefined') groupVisibilityState[groupKey] = { isExpanded: true };
                const groupHeaderRow = projectTableBody.insertRow(); groupHeaderRow.classList.add("fix-group-header");
                const groupHeaderCell = groupHeaderRow.insertCell(); groupHeaderCell.setAttribute("colspan", NUM_TABLE_COLUMNS.toString());
                const toggleBtn = document.createElement('button'); toggleBtn.classList.add('btn', 'btn-group-toggle');
                const isExpanded = groupVisibilityState[groupKey]?.isExpanded !== false;
                toggleBtn.textContent = isExpanded ? "−" : "+"; toggleBtn.title = isExpanded ? `Collapse ${currentFixCategoryHeader}` : `Expand ${currentFixCategoryHeader}`;
                groupHeaderCell.appendChild(document.createTextNode(`${currentFixCategoryHeader} `)); groupHeaderCell.appendChild(toggleBtn);
                groupHeaderCell.onclick = (event) => { if (event.target === groupHeaderCell || event.target === toggleBtn || groupHeaderCell.contains(event.target)) { if (groupVisibilityState[groupKey]) { groupVisibilityState[groupKey].isExpanded = !groupVisibilityState[groupKey].isExpanded; saveGroupVisibilityState(); renderProjects(); } } };
            }
            renderProjectRowDetails(project);
        });
    } else { // "All Projects" is selected
        let currentProjectNameHeader = null;
        let currentFixCategoryHeader = null;
        sortedProjects.forEach(project => {
            if (!project || !project.id || !project.baseProjectName || !project.fixCategory) { return; }
            if (project.baseProjectName !== currentProjectNameHeader) {
                currentProjectNameHeader = project.baseProjectName; currentFixCategoryHeader = null;
                const projNameRow = projectTableBody.insertRow(); projNameRow.classList.add("batch-header-row");
                const projNameCell = projNameRow.insertCell(); projNameCell.setAttribute("colspan", NUM_TABLE_COLUMNS.toString()); projNameCell.textContent = `Project: ${project.baseProjectName || "Unknown"}`;
            }
            if (project.fixCategory !== currentFixCategoryHeader) {
                currentFixCategoryHeader = project.fixCategory;
                const groupKey = `${project.baseProjectName}_${currentFixCategoryHeader}`;
                if (typeof groupVisibilityState[groupKey] === 'undefined') groupVisibilityState[groupKey] = { isExpanded: true };
                const groupHeaderRow = projectTableBody.insertRow(); groupHeaderRow.classList.add("fix-group-header");
                const groupHeaderCell = groupHeaderRow.insertCell(); groupHeaderCell.setAttribute("colspan", NUM_TABLE_COLUMNS.toString());
                const toggleBtn = document.createElement('button'); toggleBtn.classList.add('btn', 'btn-group-toggle');
                const isExpanded = groupVisibilityState[groupKey]?.isExpanded !== false;
                toggleBtn.textContent = isExpanded ? "−" : "+"; toggleBtn.title = isExpanded ? `Collapse ${currentFixCategoryHeader}` : `Expand ${currentFixCategoryHeader}`;
                groupHeaderCell.appendChild(document.createTextNode(`${currentFixCategoryHeader} `)); groupHeaderCell.appendChild(toggleBtn);
                groupHeaderCell.onclick = (event) => { if (event.target === groupHeaderCell || event.target === toggleBtn || groupHeaderCell.contains(event.target)) { if (groupVisibilityState[groupKey]) { groupVisibilityState[groupKey].isExpanded = !groupVisibilityState[groupKey].isExpanded; saveGroupVisibilityState(); renderProjects(); } } };
            }
            renderProjectRowDetails(project);
        });
    }
}

function renderProjectRowDetails(project) { // Removed groupPrefixKey as it's less ambiguous now
    const row = projectTableBody.insertRow();
    const visibilityCheckKey = `${project.baseProjectName}_${project.fixCategory}`; // Key for expand/collapse

    if (groupVisibilityState[visibilityCheckKey]?.isExpanded === false) {
        row.classList.add("hidden-group-row");
    }
    if (project.fixCategory) row.classList.add(`${project.fixCategory.toLowerCase()}-row`);
    if (project.isReassigned) row.classList.add("reassigned-task-highlight");

    row.insertCell().textContent = project.fixCategory || "N/A";
    const projectNameCell = row.insertCell(); projectNameCell.textContent = project.baseProjectName || "N/A"; projectNameCell.classList.add("wrap-text");
    row.insertCell().textContent = project.areaTask || "N/A";
    row.insertCell().textContent = project.gsd || "N/A";
    const assignedToCell = row.insertCell(); const assignedToSelect = document.createElement('select');
    assignedToSelect.classList.add('assigned-to-select'); assignedToSelect.disabled = project.status === "Reassigned_TechAbsent";
    const defaultTechOption = document.createElement('option'); defaultTechOption.value = ""; defaultTechOption.textContent = "Select Tech ID"; assignedToSelect.appendChild(defaultTechOption);
    TECH_IDS.forEach(techId => { const option = document.createElement('option'); option.value = techId; option.textContent = techId; assignedToSelect.appendChild(option); });
    assignedToSelect.value = project.assignedTo || "";
    assignedToSelect.onchange = async (event) => { // Ensure 'async'
        showLoading("Updating assignment..."); const newTechId = event.target.value; const oldTechId = project.assignedTo || "";
        if (!db || !project.id) { alert("Database or project ID missing. Cannot update assignment."); event.target.value = oldTechId; hideLoading(); return; }
        try { await db.collection("projects").doc(project.id).update({ assignedTo: newTechId, lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp() }); project.assignedTo = newTechId; } // Requires 'async'
        catch (error) { console.error("Error updating assignedTo:", error); alert("Error updating assignment: " + error.message); event.target.value = oldTechId; }
        finally { hideLoading(); }
    };
    assignedToCell.appendChild(assignedToSelect);

    const statusCell = row.insertCell(); const statusSpan = document.createElement('span'); statusSpan.classList.add('status'); let statusText = (project.status || "Unknown").replace(/([A-Z])(?=[a-z0-9_])/g, ' $1').trim();
    if (project.status === "Day1Ended_AwaitingNext") statusText = "Started Day 1 Ended"; else if (project.status === "Day2Ended_AwaitingNext") statusText = "Started Day 2 Ended"; else if (project.status === "Day3Ended_AwaitingNext") statusText = "Started Day 3 Ended"; else if (project.status === "Reassigned_TechAbsent") statusText = "Re-Assigned";
    statusSpan.textContent = statusText; statusSpan.classList.add(`status-${(project.status || "unknown").toLowerCase()}`); statusCell.appendChild(statusSpan);

    function formatTime(timestampOrDate) { if (!timestampOrDate) return ""; let date; try { if (timestampOrDate.toDate && typeof timestampOrDate.toDate === 'function') date = timestampOrDate.toDate(); else if (timestampOrDate instanceof Date) date = timestampOrDate; else date = new Date(timestampOrDate); if (isNaN(date.getTime())) return ""; } catch (e) { return ""; } return date.toTimeString().slice(0, 5); }
    
    async function updateTimeField(projectId, fieldName, newValue, projectData) { // Ensure 'async'
        showLoading(`Updating ${fieldName}...`); if (!db || !projectId) { alert("Database or project ID missing. Cannot update time."); hideLoading(); return; }
        let firestoreTimestamp = null; if (newValue) { const today = new Date(); const [hours, minutes] = newValue.split(':').map(Number); today.setHours(hours, minutes, 0, 0); firestoreTimestamp = firebase.firestore.Timestamp.fromDate(today); }
        try { await db.collection("projects").doc(projectId).update({ [fieldName]: firestoreTimestamp, lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp() }); // Requires 'async'
            let updatedProjectData = { ...projectData, [fieldName]: firestoreTimestamp }; let durationFieldToUpdate = ""; let startTimeForCalc = null; let finishTimeForCalc = null;
            if (fieldName.includes("Day1")) { durationFieldToUpdate = "durationDay1Ms"; startTimeForCalc = updatedProjectData.startTimeDay1; finishTimeForCalc = updatedProjectData.finishTimeDay1; }
            else if (fieldName.includes("Day2")) { durationFieldToUpdate = "durationDay2Ms"; startTimeForCalc = updatedProjectData.startTimeDay2; finishTimeForCalc = updatedProjectData.finishTimeDay2; }
            else if (fieldName.includes("Day3")) { durationFieldToUpdate = "durationDay3Ms"; startTimeForCalc = updatedProjectData.startTimeDay3; finishTimeForCalc = updatedProjectData.finishTimeDay3; }
            if (durationFieldToUpdate && startTimeForCalc && finishTimeForCalc) { const newDuration = calculateDurationMs(startTimeForCalc, finishTimeForCalc); await db.collection("projects").doc(projectId).update({ [durationFieldToUpdate]: newDuration, lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp() }); } // Requires 'async'
        } catch (error) { console.error(`Error updating ${fieldName}:`, error); alert(`Error updating ${fieldName}: ` + error.message); } finally { hideLoading(); }
    }
    const isTaskDisabled = project.status === "Reassigned_TechAbsent";
    const startTime1Cell = row.insertCell(); const startTime1Input = document.createElement('input'); startTime1Input.type = 'time'; startTime1Input.value = formatTime(project.startTimeDay1); startTime1Input.disabled = isTaskDisabled; startTime1Input.onchange = (event) => updateTimeField(project.id, 'startTimeDay1', event.target.value, project); startTime1Cell.appendChild(startTime1Input);
    const finishTime1Cell = row.insertCell(); const finishTime1Input = document.createElement('input'); finishTime1Input.type = 'time'; finishTime1Input.value = formatTime(project.finishTimeDay1); finishTime1Input.disabled = isTaskDisabled; finishTime1Input.onchange = (event) => updateTimeField(project.id, 'finishTimeDay1', event.target.value, project); finishTime1Cell.appendChild(finishTime1Input);
    const startTime2Cell = row.insertCell(); const startTime2Input = document.createElement('input'); startTime2Input.type = 'time'; startTime2Input.value = formatTime(project.startTimeDay2); startTime2Input.disabled = isTaskDisabled; startTime2Input.onchange = (event) => updateTimeField(project.id, 'startTimeDay2', event.target.value, project); startTime2Cell.appendChild(startTime2Input);
    const finishTime2Cell = row.insertCell(); const finishTime2Input = document.createElement('input'); finishTime2Input.type = 'time'; finishTime2Input.value = formatTime(project.finishTimeDay2); finishTime2Input.disabled = isTaskDisabled; finishTime2Input.onchange = (event) => updateTimeField(project.id, 'finishTimeDay2', event.target.value, project); finishTime2Cell.appendChild(finishTime2Input);
    const startTime3Cell = row.insertCell(); const startTime3Input = document.createElement('input'); startTime3Input.type = 'time'; startTime3Input.value = formatTime(project.startTimeDay3); startTime3Input.disabled = isTaskDisabled; startTime3Input.onchange = (event) => updateTimeField(project.id, 'startTimeDay3', event.target.value, project); startTime3Cell.appendChild(startTime3Input);
    const finishTime3Cell = row.insertCell(); const finishTime3Input = document.createElement('input'); finishTime3Input.type = 'time'; finishTime3Input.value = formatTime(project.finishTimeDay3); finishTime3Input.disabled = isTaskDisabled; finishTime3Input.onchange = (event) => updateTimeField(project.id, 'finishTimeDay3', event.target.value, project); finishTime3Cell.appendChild(finishTime3Input);
    const totalDurationMsDay1 = project.durationDay1Ms || 0; const totalDurationMsDay2 = project.durationDay2Ms || 0; const totalDurationMsDay3 = project.durationDay3Ms || 0; const totalWorkDurationMs = totalDurationMsDay1 + totalDurationMsDay2 + totalDurationMsDay3; const breakMs = (project.breakDurationMinutes || 0) * 60000; const additionalMs = (project.additionalMinutesManual || 0) * 60000; let finalAdjustedDurationMs = Math.max(0, totalWorkDurationMs - breakMs) + additionalMs; if (totalWorkDurationMs === 0 && (project.breakDurationMinutes || 0) === 0 && (project.additionalMinutesManual || 0) === 0) finalAdjustedDurationMs = null;
    const totalDurationCell = row.insertCell(); totalDurationCell.textContent = formatMillisToMinutes(finalAdjustedDurationMs); totalDurationCell.classList.add('total-duration-column');
    const techNotesCell = row.insertCell(); const techNotesInput = document.createElement('textarea');
    techNotesInput.value = project.techNotes || ""; techNotesInput.placeholder = "Notes"; techNotesInput.classList.add('tech-notes-input'); techNotesInput.rows = 1; techNotesInput.id = `techNotes_${project.id}`; techNotesInput.disabled = project.status === "Reassigned_TechAbsent";
    techNotesInput.onchange = async (event) => { // Ensure 'async'
        showLoading("Updating tech notes..."); const newNotes = event.target.value; const oldNotes = project.techNotes || "";
        if (!db || !project.id) { alert("Database or project ID missing. Cannot update notes."); event.target.value = oldNotes; hideLoading(); return; }
        try { await db.collection("projects").doc(project.id).update({ techNotes: newNotes, lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp() }); project.techNotes = newNotes; } // Requires 'async'
        catch (error) { console.error("Error updating techNotes:", error); alert("Error updating tech notes: " + error.message); event.target.value = oldNotes; }
        finally { hideLoading(); }
    };
    techNotesCell.appendChild(techNotesInput);
    const actionsCell = row.insertCell(); const actionButtonsDiv = document.createElement('div'); actionButtonsDiv.classList.add('action-buttons-container');
    const breakSelect = document.createElement('select');
    breakSelect.classList.add('break-select'); breakSelect.id = `breakSelect_${project.id}`; breakSelect.title = "Select break time to deduct"; breakSelect.disabled = isTaskDisabled;
    [{ value: "0", text: "No Break" }, { value: "15", text: "15m Break" }, { value: "60", text: "1h Break" }, { value: "90", text: "1h30m Break" }].forEach(opt => { const option = document.createElement('option'); option.value = opt.value; option.textContent = opt.text; breakSelect.appendChild(option); });
    breakSelect.value = typeof project.breakDurationMinutes === 'number' ? project.breakDurationMinutes.toString() : "0";
    breakSelect.onchange = async (event) => { // Ensure 'async'
        showLoading("Updating break duration..."); const newBreakMinutes = parseInt(event.target.value, 10); const oldBreakMinutes = project.breakDurationMinutes || 0;
        if (!db || !project.id) { alert("Database or project ID missing. Cannot update break duration."); event.target.value = oldBreakMinutes.toString(); hideLoading(); return; }
        try { await db.collection("projects").doc(project.id).update({ breakDurationMinutes: newBreakMinutes, lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp() }); project.breakDurationMinutes = newBreakMinutes; // Requires 'async'
            const currentRow = event.target.closest('tr'); if (currentRow) { const durationDisplayCell = currentRow.querySelector('.total-duration-column'); if (durationDisplayCell) { const currentTotalWorkMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0); const currentAdditionalMs = (project.additionalMinutesManual || 0) * 60000; let newAdjustedDuration = Math.max(0, currentTotalWorkMs - (newBreakMinutes * 60000)) + currentAdditionalMs; if (currentTotalWorkMs === 0 && newBreakMinutes === 0 && (project.additionalMinutesManual || 0) === 0) newAdjustedDuration = null; durationDisplayCell.textContent = formatMillisToMinutes(newAdjustedDuration); } }
        } catch (error) { console.error("Error updating break duration:", error); alert("Error updating break duration: " + error.message); event.target.value = oldBreakMinutes.toString(); } finally { hideLoading(); }
    };
    actionButtonsDiv.appendChild(breakSelect);
    const createActionButton = (text, className, disabledCondition, action) => { const button = document.createElement('button'); button.textContent = text; button.classList.add('btn', className); button.disabled = isTaskDisabled || disabledCondition; button.onclick = () => { if (project.id) updateProjectState(project.id, action, project); }; return button; };
    actionButtonsDiv.appendChild(createActionButton("Start D1", "btn-day-start", !["Available"].includes(project.status), "startDay1")); actionButtonsDiv.appendChild(createActionButton("End D1", "btn-day-end", project.status !== "InProgressDay1", "endDay1")); actionButtonsDiv.appendChild(createActionButton("Start D2", "btn-day-start", !["Day1Ended_AwaitingNext"].includes(project.status), "startDay2")); actionButtonsDiv.appendChild(createActionButton("End D2", "btn-day-end", project.status !== "InProgressDay2", "endDay2")); actionButtonsDiv.appendChild(createActionButton("Start D3", "btn-day-start", !["Day2Ended_AwaitingNext"].includes(project.status), "startDay3")); actionButtonsDiv.appendChild(createActionButton("End D3", "btn-day-end", project.status !== "InProgressDay3", "endDay3")); actionButtonsDiv.appendChild(createActionButton("Done", "btn-mark-done", project.status === "Completed", "markDone"));
    const reassignBtn = document.createElement('button'); reassignBtn.textContent = "Re-Assign"; reassignBtn.classList.add('btn', 'btn-warning'); reassignBtn.title = "Re-assign task by creating a new entry. Current task will be closed."; reassignBtn.disabled = project.status === "Completed" || isTaskDisabled;
    reassignBtn.onclick = () => { const currentProjectData = projects.find(p => p.id === project.id); if (currentProjectData) handleReassignment(currentProjectData); };
    actionButtonsDiv.appendChild(reassignBtn);
    actionsCell.appendChild(actionButtonsDiv);
}

async function updateProjectState(projectId, action, currentProjectData) { /* ... (unchanged) ... */ }
async function handleReassignment(projectToReassign) { /* ... (unchanged) ... */ }
function refreshAllViews() { /* ... (unchanged) ... */ }
async function renderAllowedEmailsList() { /* ... (unchanged) ... */ }
async function handleAddEmail() { /* ... (unchanged) ... */ }
async function handleRemoveEmail(emailToRemove) { /* ... (unchanged) ... */ }
async function generateTlSummaryData() { /* ... (unchanged) ... */ }
function setupAuthEventListeners() { /* ... (unchanged) ... */ }
function initializeAppComponents() { /* ... (unchanged) ... */ }

if (auth) { // Ensure 'async' for onAuthStateChanged
    auth.onAuthStateChanged(async (user) => { /* ... (unchanged body from previous correct version, it uses await fetchAllowedEmails) ... */ 
        setupDOMReferences(); setupAuthRelatedDOMReferences();
        if (!userNameP || !userEmailP || !userPhotoImg || !userInfoDisplayDiv || !signInBtn || !appContentDiv || !loadingAuthMessageDiv || !openSettingsBtn) { console.error("One or more critical UI elements for auth state change not found. Aborting UI update."); const loadingMsgElem = document.getElementById('loading-auth-message') || loadingAuthMessageDiv; if(loadingMsgElem) { loadingMsgElem.innerHTML = '<p style="color:red; font-weight:bold;">UI Error: Critical elements missing. Please refresh.</p>'; loadingMsgElem.style.display = 'block'; } hideLoading(); return; }
        if (user) {
            showLoading("Checking authorization..."); await fetchAllowedEmails(); const userEmailLower = user.email ? user.email.toLowerCase() : "";
            if (user.email && allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(userEmailLower)) { console.log("Auth state changed: User is SIGNED IN and ALLOWED - ", user.displayName, user.email); userNameP.textContent = user.displayName || "Name not available"; userEmailP.textContent = user.email || "Email not available"; if (userPhotoImg) userPhotoImg.src = user.photoURL || 'default-user.png'; userInfoDisplayDiv.style.display = 'flex'; signInBtn.style.display = 'none'; loadingAuthMessageDiv.style.display = 'none'; appContentDiv.style.display = 'block'; if (openSettingsBtn) openSettingsBtn.style.display = 'block'; initializeAppComponents();
            } else {
                console.warn("Auth state changed: User SIGNED IN but NOT ALLOWED - ", user.email); alert("Access Denied: Your email address (" + (user.email || "N/A") + ") is not authorized to use this application. You will be signed out.");
                auth.signOut().then(() => { console.log("Unauthorized user automatically signed out."); loadingAuthMessageDiv.innerHTML = "<p>Access Denied. Please sign in with an authorized account.</p>"; userInfoDisplayDiv.style.display = 'none'; signInBtn.style.display = 'block'; appContentDiv.style.display = 'none'; loadingAuthMessageDiv.style.display = 'block'; if (openSettingsBtn) openSettingsBtn.style.display = 'none'; projects = []; if (projectTableBody) projectTableBody.innerHTML = ""; if (tlDashboardContentElement) tlDashboardContentElement.innerHTML = ""; if (allowedEmailsList) allowedEmailsList.innerHTML = ""; if (firestoreListenerUnsubscribe) { firestoreListenerUnsubscribe(); firestoreListenerUnsubscribe = null; console.log("Firestore listener detached for unauthorized user sign out.");} isAppInitialized = false; hideLoading();
                }).catch(err => { console.error("Error signing out unauthorized user:", err); alert("Access Denied. Error during sign out: "+ err.message + " Please refresh."); userInfoDisplayDiv.style.display = 'none'; signInBtn.style.display = 'block'; appContentDiv.style.display = 'none'; loadingAuthMessageDiv.innerHTML = "<p>Access Denied. Error during sign out. Please refresh.</p>"; loadingAuthMessageDiv.style.display = 'block'; if (openSettingsBtn) openSettingsBtn.style.display = 'none'; hideLoading(); });
            }
        } else {
            console.log("Auth state changed: User is SIGNED OUT"); userNameP.textContent = ""; userEmailP.textContent = ""; if (userPhotoImg) userPhotoImg.src = ""; userInfoDisplayDiv.style.display = 'none'; signInBtn.style.display = 'block'; appContentDiv.style.display = 'none'; if (openSettingsBtn) openSettingsBtn.style.display = 'none';
            if (loadingAuthMessageDiv.innerHTML.indexOf("Access Denied") === -1) { loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>"; } loadingAuthMessageDiv.style.display = 'block';
            projects = []; if (projectTableBody) projectTableBody.innerHTML = ""; if (tlDashboardContentElement) tlDashboardContentElement.innerHTML = ""; if (allowedEmailsList) allowedEmailsList.innerHTML = ""; if (firestoreListenerUnsubscribe) { firestoreListenerUnsubscribe(); firestoreListenerUnsubscribe = null; console.log("Firestore listener detached on sign out.");} isAppInitialized = false; console.log("App content hidden, project data cleared, and Firestore listener detached."); hideLoading();
        }
    });
} else {
    console.error("Firebase Auth is not initialized. UI updates based on auth state will not occur."); const loadingMessageElement = document.getElementById('loading-auth-message'); if (loadingMessageElement) { loadingMessageElement.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check the console and refresh.</p>'; loadingMessageElement.style.display = 'block'; }
}
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded."); setupDOMReferences(); setupAuthRelatedDOMReferences();
    if (auth) { setupAuthEventListeners(); console.log("Auth UI and event listeners set up on DOMContentLoaded."); }
    else { console.error("Firebase Auth not available on DOMContentLoaded. Auth UI setup skipped."); const authContainer = document.getElementById('auth-container'); const loadingMsg = loadingAuthMessageDiv || document.getElementById('loading-auth-message'); if (authContainer && loadingMsg) { loadingMsg.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check console and refresh.</p>'; loadingMsg.style.display = 'block'; if (signInBtn) signInBtn.style.display = 'none'; } }
});
