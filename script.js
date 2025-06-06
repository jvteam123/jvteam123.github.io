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
    fetchAllowedEmails(); // Initial fetch

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
    "Available": 1,
    "InProgressDay1": 2,
    "Day1Ended_AwaitingNext": 3,
    "InProgressDay2": 4,
    "Day2Ended_AwaitingNext": 5,
    "InProgressDay3": 6,
    "Day3Ended_AwaitingNext": 7,
    "Completed": 8,
    "Reassigned_TechAbsent": 9
};
const NUM_TABLE_COLUMNS = 15;

// DOM Elements
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

// Filter elements
let batchIdSelect, fixCategoryFilter, monthFilter;
let currentSelectedBatchId = localStorage.getItem('currentSelectedBatchId') || "";
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

    if (startTime && typeof startTime.toMillis === 'function') {
        startMillis = startTime.toMillis();
    }
    if (finishTime && typeof finishTime.toMillis === 'function') {
        finishMillis = finishTime.toMillis();
    }
    
    if (typeof startMillis !== 'number' || typeof finishMillis !== 'number' || finishMillis < startMillis) {
        return null;
    }
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
    if (!db) {
        console.error("Firestore (db) not initialized. Cannot fetch allowed emails.");
        hideLoading();
        return;
    }
    try {
        const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            allowedEmailsFromFirestore = docSnap.data().emails || [];
        } else {
            console.warn(`Document ${ALLOWED_EMAILS_DOC_REF_PATH} does not exist. No emails loaded initially.`);
            allowedEmailsFromFirestore = ["ev.lorens.ebrado@gmail.com"];
        }
    } catch (error) {
        console.error("Error fetching allowed emails:", error);
        allowedEmailsFromFirestore = ["ev.lorens.ebrado@gmail.com"];
    } finally {
        hideLoading();
    }
}

async function updateAllowedEmailsInFirestore(emailsArray) {
    showLoading("Updating allowed emails...");
    if (!db) {
        alert("Database not initialized! Cannot update allowed emails.");
        hideLoading();
        return false;
    }
    const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
    try {
        await docRef.set({ emails: emailsArray });
        allowedEmailsFromFirestore = emailsArray;
        return true;
    } catch (error) {
        console.error("Error updating allowed emails in Firestore:", error);
        alert("Error saving allowed emails. Error: " + error.message);
        return false;
    } finally {
        hideLoading();
    }
}


async function initializeFirebaseAndLoadData() {
    showLoading("Loading projects...");
    if (!db) {
        console.error("Firestore (db) not initialized. Cannot load project data.");
        projects = [];
        refreshAllViews();
        hideLoading();
        return;
    }

    if (firestoreListenerUnsubscribe) {
        firestoreListenerUnsubscribe();
        firestoreListenerUnsubscribe = null;
    }

    loadGroupVisibilityState();

    let allProjectsForMonthFilterQuery = db.collection("projects").orderBy("creationTimestamp", "desc");
    try {
        const allProjectsSnapshot = await allProjectsForMonthFilterQuery.get();
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
            monthFilter.innerHTML = '<option value="">All Months</option>';
            Array.from(uniqueMonths).sort((a, b) => b.localeCompare(a)).forEach(monthYear => {
                const [year, month] = monthYear.split('-');
                const date = new Date(year, parseInt(month) - 1, 1);
                const option = document.createElement('option');
                option.value = monthYear;
                option.textContent = date.toLocaleString('en-US', { year: 'numeric', month: 'long' });
                monthFilter.appendChild(option);
            });
            if (currentSelectedMonth && Array.from(uniqueMonths).includes(currentSelectedMonth)) {
                monthFilter.value = currentSelectedMonth;
            } else {
                currentSelectedMonth = "";
                monthFilter.value = "";
                localStorage.setItem('currentSelectedMonth', "");
            }
        }
    } catch (error) {
        console.error("Error populating month filter:", error);
    }

    let queryForProjectNames = db.collection("projects");
    if (currentSelectedMonth && monthFilter && monthFilter.value) {
        const [year, month] = currentSelectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
        queryForProjectNames = queryForProjectNames.where("creationTimestamp", ">=", startDate)
                                                  .where("creationTimestamp", "<=", endDate);
    }

    try {
        const projectNamesSnapshot = await queryForProjectNames.get();
        const uniqueBaseProjectNames = new Set();
        projectNamesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.baseProjectName) {
                uniqueBaseProjectNames.add(data.baseProjectName);
            }
        });
        const sortedBaseProjectNames = Array.from(uniqueBaseProjectNames).sort();

        if (batchIdSelect) {
            batchIdSelect.innerHTML = '<option value="">All Projects</option>';
            sortedBaseProjectNames.forEach(projectName => {
                const option = document.createElement('option');
                option.value = projectName;
                option.textContent = projectName;
                batchIdSelect.appendChild(option);
            });

            if (currentSelectedBatchId && sortedBaseProjectNames.includes(currentSelectedBatchId)) {
                batchIdSelect.value = currentSelectedBatchId;
            } else {
                batchIdSelect.value = "";
                currentSelectedBatchId = "";
                localStorage.setItem('currentSelectedBatchId', "");
            }
        }
    } catch (error) {
        console.error("Error populating project name filter:", error);
        if (batchIdSelect) {
            batchIdSelect.innerHTML = '<option value="" disabled selected>Error loading projects</option>';
        }
    }

    let projectsQuery = db.collection("projects");
    if (currentSelectedMonth && monthFilter && monthFilter.value) {
        const [year, month] = currentSelectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
        projectsQuery = projectsQuery.where("creationTimestamp", ">=", startDate).where("creationTimestamp", "<=", endDate);
    }

    if (currentSelectedBatchId && batchIdSelect && batchIdSelect.value !== "") {
        projectsQuery = projectsQuery.where("baseProjectName", "==", currentSelectedBatchId);
    }

    if (currentSelectedFixCategory && fixCategoryFilter && fixCategoryFilter.value) {
        projectsQuery = projectsQuery.where("fixCategory", "==", currentSelectedFixCategory);
    }
    
    projectsQuery = projectsQuery.orderBy("creationTimestamp", "desc");


    try {
        firestoreListenerUnsubscribe = projectsQuery.onSnapshot(snapshot => {
            const newProjects = [];
            snapshot.forEach(doc => {
                if (doc.exists && typeof doc.data === 'function') {
                    newProjects.push({ id: doc.id, ...doc.data() });
                }
            });
            projects = newProjects;
            projects.forEach(project => {
                if (typeof project.breakDurationMinutes === 'undefined') project.breakDurationMinutes = 0;
                if (typeof project.additionalMinutesManual === 'undefined') project.additionalMinutesManual = 0;
                if (typeof project.startTimeDay3 === 'undefined') project.startTimeDay3 = null;
                if (typeof project.finishTimeDay3 === 'undefined') project.finishTimeDay3 = null;
                if (typeof project.durationDay3Ms === 'undefined') project.durationDay3Ms = null;
            });
            refreshAllViews();
        }, error => {
            console.error("Error fetching projects with onSnapshot: ", error);
            projects = [];
            refreshAllViews();
            alert("Error loading projects: " + error.message);
        });
    } catch (error) {
        console.error("Error setting up Firebase listener: ", error);
        alert("CRITICAL ERROR: Could not set up real-time project updates. Error: " + error.message);
    } finally {
        hideLoading();
    }
}


function setupDOMReferences() {
    openAddNewProjectBtn = document.getElementById('openAddNewProjectBtn');
    openTlDashboardBtn = document.getElementById('openTlDashboardBtn');
    openSettingsBtn = document.getElementById('openSettingsBtn');
    openTlSummaryBtn = document.getElementById('openTlSummaryBtn');
    projectFormModal = document.getElementById('projectFormModal');
    tlDashboardModal = document.getElementById('tlDashboardModal');
    settingsModal = document.getElementById('settingsModal');
    tlSummaryModal = document.getElementById('tlSummaryModal');
    closeProjectFormBtn = document.getElementById('closeProjectFormBtn');
    closeTlDashboardBtn = document.getElementById('closeTlDashboardBtn');
    closeSettingsBtn = document.getElementById('closeSettingsBtn');
    closeTlSummaryBtn = document.getElementById('closeTlSummaryBtn');
    newProjectForm = document.getElementById('newProjectForm');
    projectTableBody = document.getElementById('projectTableBody');
    tlDashboardContentElement = document.getElementById('tlDashboardContent');
    allowedEmailsList = document.getElementById('allowedEmailsList');
    addEmailInput = document.getElementById('addEmailInput');
    addEmailBtn = document.getElementById('addEmailBtn');
    tlSummaryContent = document.getElementById('tlSummaryContent');
    loadingOverlay = document.getElementById('loadingOverlay');
    batchIdSelect = document.getElementById('batchIdSelect');
    fixCategoryFilter = document.getElementById('fixCategoryFilter');
    monthFilter = document.getElementById('monthFilter');
}

function setupAuthRelatedDOMReferences() {
    signInBtn = document.getElementById('signInBtn');
    signOutBtn = document.getElementById('signOutBtn');
    userInfoDisplayDiv = document.getElementById('user-info-display');
    userNameP = document.getElementById('userName');
    userEmailP = document.getElementById('userEmail');
    userPhotoImg = document.getElementById('userPhoto');
    appContentDiv = document.getElementById('app-content');
    loadingAuthMessageDiv = document.getElementById('loading-auth-message');
}


function attachEventListeners() {
    if (openAddNewProjectBtn) {
        openAddNewProjectBtn.onclick = () => {
            const pin = prompt("Enter PIN to add new tracker:");
            if (pin !== TL_DASHBOARD_PIN) {
                alert("Incorrect PIN.");
                return;
            }
            if (projectFormModal) projectFormModal.style.display = 'block';
        };
    }

    if (openTlDashboardBtn) {
        openTlDashboardBtn.onclick = () => {
            const pin = prompt("Enter PIN to access Project Settings:");
            if (pin === TL_DASHBOARD_PIN) {
                if (tlDashboardModal) tlDashboardModal.style.display = 'block';
                renderTLDashboard();
            } else {
                alert("Incorrect PIN.");
            }
        };
    }

    if (openSettingsBtn) {
        openSettingsBtn.onclick = () => {
            const pin = prompt("Enter PIN to access User Settings:");
            if (pin === TL_DASHBOARD_PIN) {
                if (settingsModal) settingsModal.style.display = 'block';
                renderAllowedEmailsList();
            } else {
                alert("Incorrect PIN.");
            }
        };
    }
     if (openTlSummaryBtn) {
        openTlSummaryBtn.onclick = () => {
            if (tlSummaryModal) tlSummaryModal.style.display = 'block';
            generateTlSummaryData();
        };
    }

    if (closeProjectFormBtn) {
        closeProjectFormBtn.onclick = () => {
            if (newProjectForm) newProjectForm.reset();
            if (projectFormModal) projectFormModal.style.display = 'none';
        };
    }
    if (closeTlDashboardBtn) {
        closeTlDashboardBtn.onclick = () => {
            if (tlDashboardModal) tlDashboardModal.style.display = 'none';
        };
    }
    if (closeSettingsBtn) {
        closeSettingsBtn.onclick = () => {
            if (settingsModal) settingsModal.style.display = 'none';
        };
    }
    if (closeTlSummaryBtn) {
        closeTlSummaryBtn.onclick = () => {
            if (tlSummaryModal) tlSummaryModal.style.display = 'none';
        };
    }

    if (addEmailBtn) {
        addEmailBtn.onclick = handleAddEmail;
    }

    if (batchIdSelect) {
        batchIdSelect.onchange = (event) => {
            currentSelectedBatchId = event.target.value;
            localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId);
            initializeFirebaseAndLoadData();
        };
    }
    if (fixCategoryFilter) {
        fixCategoryFilter.onchange = (event) => {
            currentSelectedFixCategory = event.target.value;
            initializeFirebaseAndLoadData();
        };
    }
     if (monthFilter) {
        monthFilter.onchange = (event) => {
            currentSelectedMonth = event.target.value;
            localStorage.setItem('currentSelectedMonth', currentSelectedMonth);
            currentSelectedBatchId = "";
            localStorage.setItem('currentSelectedBatchId', "");
            initializeFirebaseAndLoadData();
        };
    }

    if (typeof window !== 'undefined') {
        window.onclick = (event) => {
            if (event.target == projectFormModal) projectFormModal.style.display = 'none';
            if (event.target == tlDashboardModal) tlDashboardModal.style.display = 'none';
            if (event.target == settingsModal) settingsModal.style.display = 'none';
            if (event.target == tlSummaryModal) tlSummaryModal.style.display = 'none';
        };
    }

    if (newProjectForm) {
        newProjectForm.addEventListener('submit', handleAddProjectSubmit);
    }

    setupAuthEventListeners();
}

async function handleAddProjectSubmit(event) {
    event.preventDefault();
    showLoading("Adding project(s)...");

    if (!db) {
        alert("Database not initialized!");
        hideLoading();
        return;
    }

    const fixCategory = document.getElementById('fixCategorySelect').value;
    const numRows = parseInt(document.getElementById('numRows').value, 10);
    const baseProjectName = document.getElementById('baseProjectName').value.trim();
    const gsd = document.getElementById('gsd').value;

    if (!baseProjectName || isNaN(numRows) || numRows < 1) {
        alert("Invalid input. Please ensure Project Name is not empty and Number of Tasks is at least 1.");
        hideLoading();
        return;
    }

    const batchId = `batch_${generateId()}`;
    const creationTimestamp = firebase.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    try {
        for (let i = 1; i <= numRows; i++) {
            const projectData = {
                batchId: batchId,
                creationTimestamp: creationTimestamp,
                fixCategory: fixCategory,
                baseProjectName: baseProjectName,
                areaTask: `Area${String(i).padStart(2, '0')}`,
                gsd: gsd,
                assignedTo: "",
                techNotes: "",
                status: "Available",
                startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                releasedToNextStage: false,
                lastModifiedTimestamp: creationTimestamp,
                isReassigned: false,
                originalProjectId: null,
                breakDurationMinutes: 0,
                additionalMinutesManual: 0,
            };
            const newProjectRef = db.collection("projects").doc();
            batch.set(newProjectRef, projectData);
        }

        await batch.commit();
        if (newProjectForm) newProjectForm.reset();
        
        currentSelectedBatchId = baseProjectName;
        localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId);

        currentSelectedMonth = "";
        localStorage.setItem('currentSelectedMonth', "");
        if (monthFilter) monthFilter.value = "";

        currentSelectedFixCategory = fixCategory;
        if (fixCategoryFilter) fixCategoryFilter.value = fixCategory;

        initializeFirebaseAndLoadData();

    } catch (error) {
        console.error("Error adding projects: ", error);
        alert("Error adding projects: " + error.message);
    } finally {
        if (projectFormModal) projectFormModal.style.display = 'none';
        hideLoading();
    }
}

async function getManageableBatches() {
    if (!db) return [];
    showLoading("Loading batches for dashboard...");
    try {
        const projectsSnapshot = await db.collection("projects").get();
        const batches = {};

        projectsSnapshot.forEach(doc => {
            const task = doc.data();
            if (task && task.batchId) {
                if (!batches[task.batchId]) {
                    batches[task.batchId] = {
                        batchId: task.batchId,
                        baseProjectName: task.baseProjectName || "N/A",
                        tasksByFix: {}
                    };
                }
                if (task.fixCategory) {
                    if (!batches[task.batchId].tasksByFix[task.fixCategory]) {
                        batches[task.batchId].tasksByFix[task.fixCategory] = [];
                    }
                    batches[task.batchId].tasksByFix[task.fixCategory].push(task);
                }
            }
        });
        return Object.values(batches);
    } catch (error) {
        console.error("Error fetching batches for dashboard:", error);
        alert("Error fetching batches for dashboard: " + error.message);
        return [];
    } finally {
        hideLoading();
    }
}


async function renderTLDashboard() {
    if (!tlDashboardContentElement) return;
    tlDashboardContentElement.innerHTML = "";
    const batches = await getManageableBatches();

    if (batches.length === 0) {
        tlDashboardContentElement.innerHTML = "<p>No project batches found for TL dashboard.</p>";
        return;
    }

    batches.forEach(batch => {
        if (!batch || !batch.batchId) return;

        const batchItemDiv = document.createElement('div');
        batchItemDiv.classList.add('dashboard-batch-item');

        const title = document.createElement('h4');
        title.textContent = `Project: ${batch.baseProjectName || "Unknown"} (Batch ID: ${batch.batchId.split('_')[1] || "N/A"})`;
        batchItemDiv.appendChild(title);

        const stagesPresent = batch.tasksByFix ? Object.keys(batch.tasksByFix).sort((a,b) => FIX_CATEGORIES_ORDER.indexOf(a) - FIX_CATEGORIES_ORDER.indexOf(b)) : [];
        const stagesP = document.createElement('p');
        stagesP.innerHTML = `<strong>Stages Present:</strong> ${stagesPresent.join(', ') || "None"}`;
        batchItemDiv.appendChild(stagesP);

        const releaseActionsDiv = document.createElement('div');
        releaseActionsDiv.classList.add('dashboard-batch-actions-release');

        let currentHighestActiveFix = "";
        if (batch.tasksByFix) {
            FIX_CATEGORIES_ORDER.slice().reverse().forEach(fixCat => {
                if (!currentHighestActiveFix && batch.tasksByFix[fixCat] && batch.tasksByFix[fixCat].length > 0) {
                    currentHighestActiveFix = fixCat;
                }
            });
        }
        
        if (currentHighestActiveFix) {
            const activeTasksInFix = batch.tasksByFix[currentHighestActiveFix].filter(p => p.status !== "Reassigned_TechAbsent");
            const allTasksInHighestFixReleased = activeTasksInFix.every(p => p.releasedToNextStage);
            
            if (!allTasksInHighestFixReleased) {
                const allTasksInHighestFixCompletable = activeTasksInFix.every(p =>
                    p.status === "Completed" || p.status.includes("Ended_AwaitingNext")
                );

                const currentFixIndex = FIX_CATEGORIES_ORDER.indexOf(currentHighestActiveFix);
                if (currentFixIndex < FIX_CATEGORIES_ORDER.length - 1) {
                    const nextFixCategory = FIX_CATEGORIES_ORDER[currentFixIndex + 1];
                    const releaseBtn = document.createElement('button');
                    releaseBtn.textContent = `Release to ${nextFixCategory}`;
                    releaseBtn.classList.add('btn', 'btn-release');
                    if (!allTasksInHighestFixCompletable) {
                        releaseBtn.disabled = true;
                        releaseBtn.title = `Not all active tasks in ${currentHighestActiveFix} are 'Completed' or 'Day X Ended'.`;
                    }
                    releaseBtn.onclick = () => releaseBatchToNextFix(batch.batchId, currentHighestActiveFix, nextFixCategory);
                    releaseActionsDiv.appendChild(releaseBtn);
                }
            }
        }
        batchItemDiv.appendChild(releaseActionsDiv);

        const deleteActionsDiv = document.createElement('div');
        deleteActionsDiv.classList.add('dashboard-batch-actions-delete');
        if (batch.tasksByFix) {
            Object.keys(batch.tasksByFix).forEach(fixCat => {
                const deleteFixBtn = document.createElement('button');
                deleteFixBtn.textContent = `Delete ${fixCat} Tasks`;
                deleteFixBtn.classList.add('btn', 'btn-danger');
                deleteFixBtn.onclick = () => {
                    if (confirm(`Are you sure you want to delete all ${fixCat} tasks for project '${batch.baseProjectName}'? This is IRREVERSIBLE.`)) {
                        deleteSpecificFixTasksForBatch(batch.batchId, fixCat);
                    }
                };
                deleteActionsDiv.appendChild(deleteFixBtn);
            });
        }
        batchItemDiv.appendChild(deleteActionsDiv);

        const resetActionsDiv = document.createElement('div');
        resetActionsDiv.classList.add('dashboard-batch-actions-reset');
        resetActionsDiv.style.marginTop = '10px';
        resetActionsDiv.innerHTML = '<strong>Reset Individual Tasks:</strong>';

        const taskResetContainer = document.createElement('div');
        taskResetContainer.className = 'task-reset-container';
        taskResetContainer.style.display = 'none';
        taskResetContainer.style.marginTop = '10px';
        taskResetContainer.style.padding = '10px';
        taskResetContainer.style.border = '1px solid #ccc';

        if (batch.tasksByFix) {
            stagesPresent.forEach(fixCat => {
                const manageBtn = document.createElement('button');
                manageBtn.textContent = `Manage ${fixCat}`;
                manageBtn.className = 'btn btn-secondary btn-small';
                manageBtn.style.marginLeft = '5px';
                manageBtn.onclick = () => {
                    if (taskResetContainer.style.display === 'block' && taskResetContainer.dataset.activeFix === fixCat) {
                        taskResetContainer.style.display = 'none';
                        taskResetContainer.dataset.activeFix = '';
                    } else {
                        taskResetContainer.dataset.activeFix = fixCat;
                        taskResetContainer.style.display = 'block';
                        renderResettableTasksForBatchFix(taskResetContainer, batch.batchId, fixCat);
                    }
                };
                resetActionsDiv.appendChild(manageBtn);
            });
        }

        batchItemDiv.appendChild(resetActionsDiv);
        batchItemDiv.appendChild(taskResetContainer);

        tlDashboardContentElement.appendChild(batchItemDiv);
    });
}


async function releaseBatchToNextFix(batchId, currentFixCategory, nextFixCategory) {
    showLoading(`Releasing ${currentFixCategory} tasks...`);
    if (!db) {
        alert("Database not initialized!");
        hideLoading();
        return;
    }

    try {
        const querySnapshot = await db.collection("projects")
            .where("batchId", "==", batchId)
            .where("fixCategory", "==", currentFixCategory)
            .where("releasedToNextStage", "==", false)
            .get();

        const firestoreBatch = db.batch();
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

        for (const doc of querySnapshot.docs) {
            const task = { id: doc.id, ...doc.data() };
            if (task.status === "Reassigned_TechAbsent") continue;

            const newNextFixTask = { ...task,
                fixCategory: nextFixCategory,
                status: "Available",
                startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                releasedToNextStage: false,
                lastModifiedTimestamp: serverTimestamp,
                originalProjectId: task.id,
            };
            delete newNextFixTask.id;
            const newDocRef = db.collection("projects").doc();
            firestoreBatch.set(newDocRef, newNextFixTask);
            
            const currentTaskRef = db.collection("projects").doc(task.id);
            firestoreBatch.update(currentTaskRef, {
                releasedToNextStage: true,
                lastModifiedTimestamp: serverTimestamp
            });
        }

        await firestoreBatch.commit();
        initializeFirebaseAndLoadData();

    } catch (error) {
        console.error("Error releasing batch:", error);
        alert("Error releasing batch: " + error.message);
    } finally {
        hideLoading();
    }
}


async function deleteSpecificFixTasksForBatch(batchId, fixCategory) {
    showLoading(`Deleting ${fixCategory} tasks...`);
    if (!db || !batchId || !fixCategory) {
        alert("Invalid request.");
        hideLoading();
        return;
    }
    try {
        const querySnapshot = await db.collection("projects")
            .where("batchId", "==", batchId)
            .where("fixCategory", "==", fixCategory)
            .get();

        const batch = db.batch();
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        initializeFirebaseAndLoadData();
        renderTLDashboard();

    } catch (error) {
        console.error(`Error deleting ${fixCategory} for batch ${batchId}:`, error);
        alert("Error deleting specific fix tasks: " + error.message);
    } finally {
        hideLoading();
    }
}

async function resetProjectTask(projectId) {
    showLoading("Resetting task...");
    if (!db || !projectId) {
        alert("Database not initialized or project ID missing.");
        hideLoading();
        return;
    }
    const projectRef = db.collection("projects").doc(projectId);

    try {
        const doc = await projectRef.get();
        if (!doc.exists) {
            throw new Error("Project document not found.");
        }
        const projectData = doc.data();

        const today = new Date().toLocaleDateString('en-US');
        const originalNotes = projectData.techNotes || "";
        const resetNotes = `Task Reset by TL on ${today}. Original Notes: "${originalNotes}"`;

        const updateData = {
            status: "Available",
            assignedTo: "",
            startTimeDay1: null,
            finishTimeDay1: null,
            durationDay1Ms: null,
            startTimeDay2: null,
            finishTimeDay2: null,
            durationDay2Ms: null,
            startTimeDay3: null,
            finishTimeDay3: null,
            durationDay3Ms: null,
            techNotes: resetNotes,
            breakDurationMinutes: 0,
            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        await projectRef.update(updateData);
    } catch (error) {
        console.error(`Error resetting project ${projectId}:`, error);
        alert("Error resetting the task: " + error.message);
    } finally {
        hideLoading();
    }
}

async function renderResettableTasksForBatchFix(containerElement, batchId, fixCategory) {
    if (!db || !containerElement) return;
    containerElement.innerHTML = `<p>Loading tasks for ${fixCategory}...</p>`;

    try {
        const querySnapshot = await db.collection("projects")
            .where("batchId", "==", batchId)
            .where("fixCategory", "==", fixCategory)
            .orderBy("areaTask")
            .get();

        if (querySnapshot.empty) {
            containerElement.innerHTML = `<p>No tasks found for ${fixCategory}.</p>`;
            return;
        }

        containerElement.innerHTML = '';
        const taskListUl = document.createElement('ul');
        taskListUl.className = 'resettable-tasks-list';

        querySnapshot.forEach(doc => {
            const project = { id: doc.id, ...doc.data() };
            const li = document.createElement('li');
            li.innerHTML = `
                <strong>${project.areaTask}</strong> - 
                Status: ${project.status.replace(/([A-Z])/g, ' $1').trim()} - 
                Assigned: ${project.assignedTo || 'N/A'}
            `;
            
            const resetButton = document.createElement('button');
            resetButton.textContent = "Reset Task";
            resetButton.className = 'btn btn-danger btn-small';
            
            if (project.status === 'Available' || project.releasedToNextStage) {
                resetButton.disabled = true;
                resetButton.title = project.releasedToNextStage 
                    ? "Cannot reset a task that has been released." 
                    : "Task is already available.";
            }
            
            resetButton.onclick = async () => {
                if (confirm(`Are you sure you want to reset task '${project.areaTask}'? All progress will be lost.`)) {
                    await resetProjectTask(project.id);
                    renderResettableTasksForBatchFix(containerElement, batchId, fixCategory);
                }
            };

            li.appendChild(resetButton);
            taskListUl.appendChild(li);
        });

        containerElement.appendChild(taskListUl);

    } catch (error) {
        console.error("Error rendering resettable tasks:", error);
        containerElement.innerHTML = `<p style="color:red;">Error loading tasks: ${error.message}</p>`;
    }
}


function renderProjects() {
    if (!projectTableBody) {
        console.error("CRITICAL: projectTableBody not found.");
        return;
    }
    projectTableBody.innerHTML = "";

    const sortedProjects = [...projects].sort((a, b) => {
        const nameA = a.baseProjectName || "";
        const nameB = b.baseProjectName || "";
        const fixA = FIX_CATEGORIES_ORDER.indexOf(a.fixCategory || "");
        const fixB = FIX_CATEGORIES_ORDER.indexOf(b.fixCategory || "");
        const areaA = a.areaTask || "";
        const areaB = b.areaTask || "";

        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        if (fixA < fixB) return -1;
        if (fixA > fixB) return 1;
        if (areaA < areaB) return -1;
        if (areaA > areaB) return 1;
        return 0;
    });


    let currentBaseProjectNameHeader = null;
    let currentFixCategoryHeader = null;

    sortedProjects.forEach(project => {
        if (!project || !project.id || !project.baseProjectName || !project.fixCategory) {
             console.warn("Skipping rendering of invalid project:", project);
             return;
        }

        if (project.baseProjectName !== currentBaseProjectNameHeader) {
            currentBaseProjectNameHeader = project.baseProjectName;
            currentFixCategoryHeader = null;
            const projectNameHeaderRow = projectTableBody.insertRow();
            projectNameHeaderRow.classList.add("batch-header-row");
            const cell = projectNameHeaderRow.insertCell();
            cell.colSpan = NUM_TABLE_COLUMNS;
            cell.textContent = `Project: ${project.baseProjectName}`;
        }

        if (project.fixCategory !== currentFixCategoryHeader) {
            currentFixCategoryHeader = project.fixCategory;
            const groupKey = `${currentBaseProjectNameHeader}_${currentFixCategoryHeader}`;
            if (groupVisibilityState[groupKey] === undefined) {
                groupVisibilityState[groupKey] = { isExpanded: true };
            }
            const groupHeaderRow = projectTableBody.insertRow();
            groupHeaderRow.classList.add("fix-group-header");
            const cell = groupHeaderRow.insertCell();
            cell.colSpan = NUM_TABLE_COLUMNS;
            const isExpanded = groupVisibilityState[groupKey]?.isExpanded !== false;
            cell.innerHTML = `${currentFixCategoryHeader} <button class="btn btn-group-toggle">${isExpanded ? "−" : "+"}</button>`;
            cell.onclick = () => {
                groupVisibilityState[groupKey].isExpanded = !isExpanded;
                saveGroupVisibilityState();
                renderProjects();
            };
        }
        
        const row = projectTableBody.insertRow();
        const groupKey = `${currentBaseProjectNameHeader}_${project.fixCategory}`;
        if (groupVisibilityState[groupKey]?.isExpanded === false) {
            row.classList.add("hidden-group-row");
        }
        if (project.isReassigned) {
            row.classList.add("reassigned-task-highlight");
        }

        row.insertCell().textContent = project.fixCategory;
        row.insertCell().textContent = project.baseProjectName;
        row.insertCell().textContent = project.areaTask;
        row.insertCell().textContent = project.gsd;

        const assignedToCell = row.insertCell();
        const assignedToSelect = document.createElement('select');
        assignedToSelect.className = 'assigned-to-select';
        assignedToSelect.disabled = project.status === "Reassigned_TechAbsent";
        assignedToSelect.innerHTML = `<option value="">Select Tech ID</option>` + TECH_IDS.map(id => `<option value="${id}">${id}</option>`).join('');
        assignedToSelect.value = project.assignedTo || "";
        assignedToSelect.onchange = (event) => {
            db.collection("projects").doc(project.id).update({
                assignedTo: event.target.value,
                lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        };
        assignedToCell.appendChild(assignedToSelect);

        const statusCell = row.insertCell();
        const statusSpan = document.createElement('span');
        statusSpan.className = `status status-${(project.status || "unknown").toLowerCase()}`;
        statusSpan.textContent = (project.status || "Unknown").replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
        statusCell.appendChild(statusSpan);
        
        function formatTime(timestamp) {
            if (!timestamp || !timestamp.toDate) return "";
            return timestamp.toDate().toTimeString().slice(0, 5);
        }

        const createTimeInput = (timeValue, fieldName) => {
            const cell = row.insertCell();
            const input = document.createElement('input');
            input.type = 'time';
            input.value = formatTime(timeValue);
            input.disabled = project.status === "Reassigned_TechAbsent";
            input.onchange = (event) => updateTimeField(project.id, fieldName, event.target.value);
            cell.appendChild(input);
        };
        
        createTimeInput(project.startTimeDay1, 'startTimeDay1');
        createTimeInput(project.finishTimeDay1, 'finishTimeDay1');
        createTimeInput(project.startTimeDay2, 'startTimeDay2');
        createTimeInput(project.finishTimeDay2, 'finishTimeDay2');
        createTimeInput(project.startTimeDay3, 'startTimeDay3');
        createTimeInput(project.finishTimeDay3, 'finishTimeDay3');

        const totalDurationMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0);
        const breakMs = (project.breakDurationMinutes || 0) * 60000;
        const additionalMs = (project.additionalMinutesManual || 0) * 60000;
        const finalAdjustedDurationMs = Math.max(0, totalDurationMs - breakMs) + additionalMs;
        const totalDurationCell = row.insertCell();
        totalDurationCell.textContent = formatMillisToMinutes(finalAdjustedDurationMs);
        totalDurationCell.classList.add('total-duration-column');

        const techNotesCell = row.insertCell();
        const techNotesInput = document.createElement('textarea');
        techNotesInput.value = project.techNotes || "";
        techNotesInput.className = 'tech-notes-input';
        techNotesInput.disabled = project.status === "Reassigned_TechAbsent";
        techNotesInput.onchange = (event) => {
            db.collection("projects").doc(project.id).update({
                techNotes: event.target.value,
                lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        };
        techNotesCell.appendChild(techNotesInput);

        const actionsCell = row.insertCell();
        const actionButtonsDiv = document.createElement('div');
        actionButtonsDiv.className = 'action-buttons-container';

        const breakSelect = document.createElement('select');
        breakSelect.className = 'break-select';
        breakSelect.disabled = project.status === "Reassigned_TechAbsent";
        breakSelect.innerHTML = `
            <option value="0">No Break</option>
            <option value="15">15m Break</option>
            <option value="60">1h Break</option>
            <option value="90">1h30m Break</option>
        `;
        breakSelect.value = project.breakDurationMinutes || 0;
        breakSelect.onchange = (event) => {
            db.collection("projects").doc(project.id).update({
                breakDurationMinutes: parseInt(event.target.value, 10),
                lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        };
        actionButtonsDiv.appendChild(breakSelect);
        
        const createActionButton = (text, className, disabled, action) => {
            const button = document.createElement('button');
            button.textContent = text;
            button.className = `btn ${className}`;
            button.disabled = project.status === "Reassigned_TechAbsent" || disabled;
            button.onclick = () => updateProjectState(project.id, action);
            return button;
        };

        actionButtonsDiv.appendChild(createActionButton("Start D1", "btn-day-start", project.status !== "Available", "startDay1"));
        actionButtonsDiv.appendChild(createActionButton("End D1", "btn-day-end", project.status !== "InProgressDay1", "endDay1"));
        actionButtonsDiv.appendChild(createActionButton("Start D2", "btn-day-start", project.status !== "Day1Ended_AwaitingNext", "startDay2"));
        actionButtonsDiv.appendChild(createActionButton("End D2", "btn-day-end", project.status !== "InProgressDay2", "endDay2"));
        actionButtonsDiv.appendChild(createActionButton("Start D3", "btn-day-start", project.status !== "Day2Ended_AwaitingNext", "startDay3"));
        actionButtonsDiv.appendChild(createActionButton("End D3", "btn-day-end", project.status !== "InProgressDay3", "endDay3"));
        actionButtonsDiv.appendChild(createActionButton("Done", "btn-mark-done", project.status === "Completed", "markDone"));

        const reassignBtn = createActionButton("Re-Assign", "btn-warning", project.status === "Completed", "reassign");
        reassignBtn.onclick = () => handleReassignment(project);
        actionButtonsDiv.appendChild(reassignBtn);

        actionsCell.appendChild(actionButtonsDiv);
    });
}

async function updateTimeField(projectId, fieldName, newValue) {
    showLoading(`Updating ${fieldName}...`);
    if (!db || !projectId) {
        alert("Database or project ID missing. Cannot update time.");
        hideLoading();
        return;
    }

    let firestoreTimestamp = null;
    if (newValue) {
        const today = new Date();
        const [hours, minutes] = newValue.split(':').map(Number);
        if (!isNaN(hours) && !isNaN(minutes)) {
            today.setHours(hours, minutes, 0, 0);
            firestoreTimestamp = firebase.firestore.Timestamp.fromDate(today);
        }
    }

    try {
        await db.collection("projects").doc(projectId).update({
            [fieldName]: firestoreTimestamp,
            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        const updatedDoc = await db.collection("projects").doc(projectId).get();
        if (!updatedDoc.exists) {
            console.error("Document not found after update:", projectId);
            return;
        }
        const updatedProjectData = updatedDoc.data();

        let durationFieldToUpdate = "";
        let newDuration = null;

        if (fieldName.includes("Day1")) {
            durationFieldToUpdate = "durationDay1Ms";
            newDuration = calculateDurationMs(updatedProjectData.startTimeDay1, updatedProjectData.finishTimeDay1);
        } else if (fieldName.includes("Day2")) {
            durationFieldToUpdate = "durationDay2Ms";
            newDuration = calculateDurationMs(updatedProjectData.startTimeDay2, updatedProjectData.finishTimeDay2);
        } else if (fieldName.includes("Day3")) {
            durationFieldToUpdate = "durationDay3Ms";
            newDuration = calculateDurationMs(updatedProjectData.startTimeDay3, updatedProjectData.finishTimeDay3);
        }

        if (durationFieldToUpdate) {
            await db.collection("projects").doc(projectId).update({
                [durationFieldToUpdate]: newDuration
            });
        }
    } catch (error) {
        console.error(`Error updating ${fieldName}:`, error);
        alert(`Error updating ${fieldName}: ` + error.message);
    } finally {
        hideLoading();
    }
}

async function updateProjectState(projectId, action) {
    showLoading("Updating project state...");
    if (!db || !projectId) {
        alert("Database not initialized or project ID missing.");
        hideLoading();
        return;
    }
    const projectRef = db.collection("projects").doc(projectId);
    
    try {
        const docSnap = await projectRef.get();
        if (!docSnap.exists) {
            console.warn("Project document not found for update:", projectId);
            hideLoading();
            return;
        }
        
        const project = docSnap.data();
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        let updates = { lastModifiedTimestamp: serverTimestamp };

        switch (action) {
            case "startDay1":
                updates.status = "InProgressDay1";
                updates.startTimeDay1 = serverTimestamp;
                break;
            case "endDay1":
                updates.status = "Day1Ended_AwaitingNext";
                updates.finishTimeDay1 = serverTimestamp;
                updates.durationDay1Ms = calculateDurationMs(project.startTimeDay1, serverTimestamp);
                break;
            case "startDay2":
                updates.status = "InProgressDay2";
                updates.startTimeDay2 = serverTimestamp;
                break;
            case "endDay2":
                updates.status = "Day2Ended_AwaitingNext";
                updates.finishTimeDay2 = serverTimestamp;
                updates.durationDay2Ms = calculateDurationMs(project.startTimeDay2, serverTimestamp);
                break;
            case "startDay3":
                updates.status = "InProgressDay3";
                updates.startTimeDay3 = serverTimestamp;
                break;
            case "endDay3":
                updates.status = "Day3Ended_AwaitingNext";
                updates.finishTimeDay3 = serverTimestamp;
                updates.durationDay3Ms = calculateDurationMs(project.startTimeDay3, serverTimestamp);
                break;
            case "markDone":
                updates.status = "Completed";
                if (project.status === "InProgressDay1") {
                    updates.finishTimeDay1 = serverTimestamp;
                    updates.durationDay1Ms = calculateDurationMs(project.startTimeDay1, serverTimestamp);
                } else if (project.status === "InProgressDay2") {
                    updates.finishTimeDay2 = serverTimestamp;
                    updates.durationDay2Ms = calculateDurationMs(project.startTimeDay2, serverTimestamp);
                } else if (project.status === "InProgressDay3") {
                    updates.finishTimeDay3 = serverTimestamp;
                    updates.durationDay3Ms = calculateDurationMs(project.startTimeDay3, serverTimestamp);
                }
                break;
            default:
                hideLoading();
                return;
        }

        await projectRef.update(updates);
    } catch(error) {
        console.error(`Error updating project ${projectId} for action ${action}:`, error);
        alert("Error updating project status: " + error.message);
    } finally {
        hideLoading();
    }
}

async function handleReassignment(projectToReassign) {
    if (!projectToReassign || projectToReassign.status === "Reassigned_TechAbsent") {
        alert("Cannot re-assign this task."); return;
    }
    const newTechId = prompt(`Re-assigning task '${projectToReassign.areaTask}'. Enter NEW Tech ID:`, projectToReassign.assignedTo || "");
    if (!newTechId) {
        alert("Reassignment cancelled."); return;
    }

    if (confirm(`Create a NEW task for '${newTechId.trim()}'? The current task will be closed.`)) {
        showLoading("Reassigning task...");
        if (!db) { alert("Database not initialized!"); hideLoading(); return; }
        const batch = db.batch();
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        
        const newProjectData = {
            ...projectToReassign,
            assignedTo: newTechId.trim(),
            status: "Available",
            techNotes: `Reassigned from ${projectToReassign.assignedTo || "N/A"}. Original ID: ${projectToReassign.id}`,
            creationTimestamp: serverTimestamp,
            lastModifiedTimestamp: serverTimestamp,
            isReassigned: true,
            originalProjectId: projectToReassign.id,
            startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
            releasedToNextStage: false,
            breakDurationMinutes: 0,
            additionalMinutesManual: 0,
        };
        delete newProjectData.id;

        const newProjectRef = db.collection("projects").doc();
        batch.set(newProjectRef, newProjectData);
        
        const oldProjectRef = db.collection("projects").doc(projectToReassign.id);
        batch.update(oldProjectRef, { status: "Reassigned_TechAbsent", lastModifiedTimestamp: serverTimestamp });
        
        try {
            await batch.commit();
        } catch (error) {
            console.error("Error in re-assignment transaction:", error);
            alert("Error during re-assignment: " + error.message);
        } finally {
            hideLoading();
        }
    }
}


function refreshAllViews() {
    try {
        renderProjects();
    } catch (error) {
        console.error("Error during refreshAllViews:", error);
        alert("An error occurred while refreshing the project display.");
        if (projectTableBody) projectTableBody.innerHTML = `<tr><td colspan="${NUM_TABLE_COLUMNS}" style="color:red;text-align:center;">Error loading projects.</td></tr>`;
    }
}

async function renderAllowedEmailsList() {
    if (!allowedEmailsList) return;
    showLoading("Rendering allowed emails...");
    allowedEmailsList.innerHTML = "";
    if (allowedEmailsFromFirestore.length === 0) {
        allowedEmailsList.innerHTML = "<li>No allowed emails configured.</li>";
        hideLoading();
        return;
    }
    allowedEmailsFromFirestore.forEach(email => {
        const li = document.createElement('li');
        li.textContent = email;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = "Remove";
        removeBtn.className = 'btn btn-danger btn-small';
        removeBtn.onclick = () => handleRemoveEmail(email);
        li.appendChild(removeBtn);
        allowedEmailsList.appendChild(li);
    });
    hideLoading();
}

async function handleAddEmail() {
    showLoading("Adding email...");
    if (!addEmailInput) { hideLoading(); return; }
    const emailToAdd = addEmailInput.value.trim().toLowerCase();
    if (!emailToAdd || !emailToAdd.includes('@')) {
        alert("Please enter a valid email address.");
        hideLoading();
        return;
    }
    if (allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(emailToAdd)) {
        alert("This email is already in the allowed list.");
        hideLoading();
        return;
    }
    const success = await updateAllowedEmailsInFirestore([...allowedEmailsFromFirestore, emailToAdd].sort());
    if (success) {
        addEmailInput.value = "";
        renderAllowedEmailsList();
    }
}

async function handleRemoveEmail(emailToRemove) {
    if (confirm(`Are you sure you want to remove ${emailToRemove}?`)) {
        showLoading("Removing email...");
        const success = await updateAllowedEmailsInFirestore(allowedEmailsFromFirestore.filter(email => email !== emailToRemove));
        if (success) {
            renderAllowedEmailsList();
        }
    }
}

async function generateTlSummaryData() {
    if (!tlSummaryContent) return;
    showLoading("Generating TL Summary...");
    tlSummaryContent.innerHTML = "<p>Loading summary...</p>";
    if (!db) {
        tlSummaryContent.innerHTML = '<p style="color:red;">Database not initialized.</p>';
        hideLoading();
        return;
    }

    try {
        const projectsSnapshot = await db.collection("projects").get();
        let allProjectsData = projectsSnapshot.docs.map(doc => doc.data());

        const projectFixCategoryTotals = {};
        const overallProjectTotals = {};

        allProjectsData.forEach(p => {
            const totalWorkMs = (p.durationDay1Ms || 0) + (p.durationDay2Ms || 0) + (p.durationDay3Ms || 0);
            if (totalWorkMs <= 0) return;

            const breakMs = (p.breakDurationMinutes || 0) * 60000;
            const additionalMs = (p.additionalMinutesManual || 0) * 60000;
            const adjustedNetMs = Math.max(0, totalWorkMs - breakMs) + additionalMs;
            const minutes = Math.floor(adjustedNetMs / 60000);
            if (minutes <= 0) return;

            const projName = p.baseProjectName || "Unknown Project";
            const fixCat = p.fixCategory || "Unknown Fix";
            const summaryKey = `${projName}_${fixCat}`;

            projectFixCategoryTotals[summaryKey] = (projectFixCategoryTotals[summaryKey] || 0) + minutes;
            overallProjectTotals[projName] = (overallProjectTotals[projName] || 0) + minutes;
        });
        
        let summaryHtml = '<ul style="list-style: none; padding: 0;">';
        const sortedOverallKeys = Object.keys(overallProjectTotals).sort();
        if (sortedOverallKeys.length > 0) {
            summaryHtml += "<h3>Overall Project Totals</h3>";
            sortedOverallKeys.forEach(key => {
                const totalMinutes = overallProjectTotals[key];
                const hoursDecimal = (totalMinutes / 60).toFixed(2);
                summaryHtml += `<li><strong>${key}:</strong> ${totalMinutes} minutes (${hoursDecimal} hours)</li>`;
            });
            summaryHtml += '<hr style="margin: 20px 0;">';
        }

        summaryHtml += "<h3>Totals by Project and Fix Category</h3>";
        const sortedFixCatKeys = Object.keys(projectFixCategoryTotals).sort();
        if (sortedFixCatKeys.length > 0) {
            sortedFixCatKeys.forEach(key => {
                const [projName, fixCat] = key.split('_');
                const totalMinutes = projectFixCategoryTotals[key];
                const hoursDecimal = (totalMinutes / 60).toFixed(2);
                summaryHtml += `<li><strong>${projName} (${fixCat}):</strong> ${totalMinutes} minutes (${hoursDecimal} hours)</li>`;
            });
        }
        
        if (sortedFixCatKeys.length === 0 && sortedOverallKeys.length === 0) {
            summaryHtml = "<p>No project time data found to generate a summary.</p>";
        } else {
            summaryHtml += "</ul>";
        }
        tlSummaryContent.innerHTML = summaryHtml;

    } catch (error) {
        console.error("Error generating TL Summary:", error);
        tlSummaryContent.innerHTML = `<p style="color:red;">Error generating summary: ${error.message}</p>`;
    } finally {
        hideLoading();
    }
}


// --- AUTHENTICATION ---
function setupAuthEventListeners() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');

    if (signInBtn) {
        signInBtn.addEventListener('click', () => {
            showLoading("Signing in...");
            if (!auth) { console.error("Auth not initialized"); hideLoading(); return; }
            auth.signInWithPopup(provider).catch((error) => {
                console.error("Sign-in error: ", error);
                alert("Error signing in: " + error.message);
                hideLoading();
            });
        });
    }

    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            showLoading("Signing out...");
            if (!auth) { console.error("Auth not initialized"); hideLoading(); return; }
            auth.signOut().catch((error) => {
                console.error("Sign-out error: ", error);
                alert("Error signing out: " + error.message);
                hideLoading();
            });
        });
    }
}


function initializeAppComponents() {
    if (isAppInitialized) {
        initializeFirebaseAndLoadData();
    } else {
        setupDOMReferences();
        attachEventListeners();
        initializeFirebaseAndLoadData();
        isAppInitialized = true;
    }
}


if (auth) {
    auth.onAuthStateChanged(async (user) => {
        setupDOMReferences();
        setupAuthRelatedDOMReferences();

        if (!userInfoDisplayDiv || !signInBtn || !appContentDiv || !loadingAuthMessageDiv) {
            console.error("Critical auth UI elements not found.");
            return;
        }

        if (user) {
            showLoading("Checking authorization...");
            await fetchAllowedEmails();
            const userEmailLower = user.email ? user.email.toLowerCase() : "";

            if (allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(userEmailLower)) {
                userNameP.textContent = user.displayName || "Name not available";
                userEmailP.textContent = user.email || "Email not available";
                if (userPhotoImg) userPhotoImg.src = user.photoURL || 'default-user.png';
                userInfoDisplayDiv.style.display = 'flex';
                signInBtn.style.display = 'none';
                appContentDiv.style.display = 'block';
                loadingAuthMessageDiv.style.display = 'none';
                if (openSettingsBtn) openSettingsBtn.style.display = 'block';
                initializeAppComponents();
            } else {
                alert("Access Denied: Your email address is not authorized.");
                auth.signOut();
            }
        } else {
            userInfoDisplayDiv.style.display = 'none';
            signInBtn.style.display = 'block';
            appContentDiv.style.display = 'none';
            loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>";
            loadingAuthMessageDiv.style.display = 'block';
            if (openSettingsBtn) openSettingsBtn.style.display = 'none';
            if (firestoreListenerUnsubscribe) {
                firestoreListenerUnsubscribe();
                firestoreListenerUnsubscribe = null;
            }
            isAppInitialized = false;
        }
        hideLoading();
    });
} else {
    console.error("Firebase Auth is not initialized.");
    const loadingMessageElement = document.getElementById('loading-auth-message');
    if (loadingMessageElement) {
        loadingMessageElement.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded.</p>';
        loadingMessageElement.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupDOMReferences();
    setupAuthRelatedDOMReferences();
    if (auth) {
        setupAuthEventListeners();
    } else {
        console.error("Firebase Auth not available on DOMContentLoaded.");
    }
});
