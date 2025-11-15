class ClaimWebApp {
    constructor() {
        this.mondayClient = new MondayClient();
        this.currentWeekStart = this.getMonday(new Date());
        this.user = null;
        this.entries = new Map();
        this.currentEditingDate = null;
        this.currentEditingEntry = null;
        this.isEditing = false;
        this.lastEntryData = {};
        this.responsivenessCheck = null;

        // Customer-work item memory system
        this.customerWorkPairs = new Map(); // customer -> Set(workItems)
        this.expiredPairs = new Set(); // Set of "customer|workItem" strings
        this.loadCustomerWorkPairs();

        // Autocomplete event handlers storage
        this.customerInputHandler = null;
        this.customerFocusHandler = null;
        this.workItemFocusHandler = null;
        this.suggestionsClickHandler = null;

        // Wait for logger to be available
        if (typeof window.diagnosticLogger !== 'undefined') {
            this.logger = window.diagnosticLogger;
        } else {
            // Fallback console logger
            this.logger = {
                log: (msg, type = 'info') => console[type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log'](msg),
                startTimer: () => ({ startTime: Date.now() }),
                endTimer: (timer) => Date.now() - timer.startTime,
                setProgress: () => { },
                toggleLogger: () => { },
                showLogger: () => { },
                startResponsivenessCheck: () => setInterval(() => { }, 1000)
            };
        }

        this.initializeApp();
    }

    // Customer-work item memory methods
    loadCustomerWorkPairs() {
        try {
            const stored = localStorage.getItem('customerWorkPairs');
            const storedExpired = localStorage.getItem('expiredCustomerWorkPairs');

            if (stored) {
                const pairs = JSON.parse(stored);
                this.customerWorkPairs = new Map(Object.entries(pairs).map(([customer, workItems]) =>
                    [customer, new Set(workItems)]
                ));
            }

            if (storedExpired) {
                this.expiredPairs = new Set(JSON.parse(storedExpired));
            }

            this.safeLog(`Loaded ${this.customerWorkPairs.size} customer-work item pairs from memory`);
        } catch (error) {
            this.safeLog('Failed to load customer-work pairs from storage', 'warn');
            this.customerWorkPairs = new Map();
            this.expiredPairs = new Set();
        }
    }

    saveCustomerWorkPairs() {
        try {
            const pairsObj = Object.fromEntries(
                Array.from(this.customerWorkPairs.entries()).map(([customer, workItems]) =>
                    [customer, Array.from(workItems)]
                )
            );
            localStorage.setItem('customerWorkPairs', JSON.stringify(pairsObj));
            localStorage.setItem('expiredCustomerWorkPairs', JSON.stringify(Array.from(this.expiredPairs)));
        } catch (error) {
            this.safeLog('Failed to save customer-work pairs to storage', 'warn');
        }
    }

    addCustomerWorkPair(customer, workItem) {
        if (!customer || !workItem || customer === 'null' || workItem === 'null') {
            return;
        }

        const pairKey = `${customer}|${workItem}`;

        // Skip if this pair is expired
        if (this.expiredPairs.has(pairKey)) {
            return;
        }

        if (!this.customerWorkPairs.has(customer)) {
            this.customerWorkPairs.set(customer, new Set());
        }

        this.customerWorkPairs.get(customer).add(workItem);
        this.saveCustomerWorkPairs();

        this.safeLog(`Added customer-work pair: ${customer} - ${workItem}`);
    }

    removeCustomerWorkPair(customer, workItem) {
        if (this.customerWorkPairs.has(customer)) {
            this.customerWorkPairs.get(customer).delete(workItem);
            if (this.customerWorkPairs.get(customer).size === 0) {
                this.customerWorkPairs.delete(customer);
            }
            this.saveCustomerWorkPairs();
        }
    }

    markPairAsExpired(customer, workItem) {
        const pairKey = `${customer}|${workItem}`;
        this.expiredPairs.add(pairKey);
        this.removeCustomerWorkPair(customer, workItem);
        this.saveCustomerWorkPairs();
        this.safeLog(`Marked pair as expired: ${customer} - ${workItem}`);
    }

    unmarkPairAsExpired(customer, workItem) {
        const pairKey = `${customer}|${workItem}`;
        this.expiredPairs.delete(pairKey);
        this.saveCustomerWorkPairs();
        this.safeLog(`Unmarked pair as expired: ${customer} - ${workItem}`);
    }

    getCustomerWorkPairs() {
        const pairs = [];
        for (const [customer, workItems] of this.customerWorkPairs.entries()) {
            for (const workItem of workItems) {
                const pairKey = `${customer}|${workItem}`;
                if (!this.expiredPairs.has(pairKey)) {
                    pairs.push({ customer, workItem });
                }
            }
        }
        return pairs.sort((a, b) => a.customer.localeCompare(b.customer));
    }

    getExpiredCustomerWorkPairs() {
        const expiredPairs = [];
        for (const pairKey of this.expiredPairs) {
            const [customer, workItem] = pairKey.split('|');
            expiredPairs.push({ customer, workItem });
        }
        return expiredPairs.sort((a, b) => a.customer.localeCompare(b.customer));
    }

    getAllCustomerWorkPairs() {
        const allPairs = this.getCustomerWorkPairs();
        const expiredPairs = this.getExpiredCustomerWorkPairs();
        return {
            active: allPairs,
            expired: expiredPairs,
            all: [...allPairs, ...expiredPairs]
        };
    }

    getCustomers() {
        return Array.from(this.customerWorkPairs.keys()).sort();
    }

    getWorkItemsForCustomer(customer) {
        if (this.customerWorkPairs.has(customer)) {
            return Array.from(this.customerWorkPairs.get(customer)).sort();
        }
        return [];
    }

    initializeApp() {
        this.safeLog('🚀 Initializing ClaimWebApp...');
        this.updateStatus('Initializing');

        try {
            this.bindEvents();
            this.loadStoredApiKey();
            this.renderCalendarView();
            this.startResponsivenessCheck();
            this.safeLog('✅ App initialized successfully');
            this.updateStatus('Ready');
        } catch (error) {
            this.safeLog(`❌ App initialization failed: ${error.message}`, 'error');
            this.updateStatus('Error', 'error');
            this.hideLoading();
        }
    }

    // Safe logging method to prevent errors
    safeLog(message, type = 'info') {
        try {
            if (this.logger && this.logger.log) {
                this.logger.log(message, type);
            } else {
                console.log(`[${type}] ${message}`);
            }
        } catch (e) {
            console.log(`[${type}] ${message}`);
        }
    }

    bindEvents() {
        this.safeLog('Binding events...');

        // API Key events
        const saveApiKeyBtn = document.getElementById('saveApiKey');
        const apiKeyInput = document.getElementById('apiKey');

        if (saveApiKeyBtn) saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());
        if (apiKeyInput) apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveApiKey();
        });

        // Navigation events
        const prevWeekBtn = document.getElementById('prevWeek');
        const nextWeekBtn = document.getElementById('nextWeek');
        const weekPicker = document.getElementById('weekPicker');
        const queryDataBtn = document.getElementById('queryData');

        if (prevWeekBtn) prevWeekBtn.addEventListener('click', () => this.previousWeek());
        if (nextWeekBtn) nextWeekBtn.addEventListener('click', () => this.nextWeek());
        if (weekPicker) weekPicker.addEventListener('change', (e) => this.selectWeek(e.target.value));
        if (queryDataBtn) queryDataBtn.addEventListener('click', () => this.loadData());

        // Debug events
        const toggleDebugBtn = document.getElementById('toggleDebug');
        const forceLoadBtn = document.getElementById('forceLoad');
        const testConnectionBtn = document.getElementById('testConnection');

        if (toggleDebugBtn) toggleDebugBtn.addEventListener('click', () => this.toggleDebug());
        if (forceLoadBtn) forceLoadBtn.addEventListener('click', () => this.forceLoad());
        if (testConnectionBtn) testConnectionBtn.addEventListener('click', () => this.testConnection());

        // Modal events
        const closeModalBtn = document.querySelector('.close-modal');
        const cancelEntryBtn = document.getElementById('cancelEntry');
        const saveEntryBtn = document.getElementById('saveEntry');
        const updateEntryBtn = document.getElementById('updateEntry');
        const addAnotherBtn = document.getElementById('addAnother');

        if (closeModalBtn) closeModalBtn.addEventListener('click', () => this.closeModal());
        if (cancelEntryBtn) cancelEntryBtn.addEventListener('click', () => this.closeModal());
        if (saveEntryBtn) saveEntryBtn.addEventListener('click', () => this.saveEntry());
        if (updateEntryBtn) updateEntryBtn.addEventListener('click', () => this.updateEntry());
        if (addAnotherBtn) addAnotherBtn.addEventListener('click', () => this.saveEntry(true));

        // Bulk actions
        const addMultipleBtn = document.getElementById('addMultipleEntries');
        const clearAllBtn = document.getElementById('clearAll');

        if (addMultipleBtn) addMultipleBtn.addEventListener('click', () => this.openMultiEntryModal());
        if (clearAllBtn) clearAllBtn.addEventListener('click', () => this.clearAllEntries());

        // Customer-work pair management
        const managePairsBtn = document.getElementById('managePairs');
        if (managePairsBtn) {
            managePairsBtn.addEventListener('click', () => this.openCustomerWorkPairsModal());
        }

        // Activity type selection
        document.querySelectorAll('.activity-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const value = e.target.getAttribute('data-value');
                const activityTypeSelect = document.getElementById('activityType');
                if (activityTypeSelect) activityTypeSelect.value = value;
            });
        });

        // Modal backdrop click
        const entryModal = document.getElementById('entryModal');
        if (entryModal) {
            entryModal.addEventListener('click', (e) => {
                if (e.target.id === 'entryModal') {
                    this.closeModal();
                }
            });
        }

        // Initialize autocomplete for customer and work item fields
        this.initializeAutocomplete();

        this.safeLog('✅ All events bound successfully');
    }

    updateStatus(status, type = 'ready') {
        const statusElement = document.getElementById('appStatus');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `status-indicator ${type}`;
        }
    }

    startResponsivenessCheck() {
        this.safeLog('Starting responsiveness check...');
        if (this.logger && this.logger.startResponsivenessCheck) {
            this.responsivenessCheck = this.logger.startResponsivenessCheck();
        }
    }

    async testConnection() {
        this.safeLog('Testing Monday.com connection...');
        this.updateStatus('Testing Connection', 'loading');
        this.showLoading('Testing connection...');

        try {
            const result = await this.mondayClient.testConnection();
            if (result.success) {
                this.safeLog('✅ Connection test successful');
                this.showNotification('Connection test successful!', 'success');
                this.updateStatus('Ready');
            } else {
                this.safeLog(`❌ Connection test failed: ${result.error}`, 'error');
                this.showNotification(`Connection failed: ${result.error}`, 'error');
                this.updateStatus('Connection Failed', 'error');
            }
        } catch (error) {
            this.safeLog(`❌ Connection test error: ${error.message}`, 'error');
            this.showNotification(`Connection error: ${error.message}`, 'error');
            this.updateStatus('Connection Error', 'error');
        } finally {
            this.hideLoading();
        }
    }

    toggleDebug() {
        if (this.logger && this.logger.toggleLogger) {
            this.logger.toggleLogger();
        }
    }

    forceLoad() {
        this.safeLog('Force loading data...');
        this.loadData();
    }

    getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    getWeekDates(startDate) {
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            dates.push(date);
        }
        return dates;
    }

    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    formatDisplayDate(date) {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatShortDate(date) {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }

    isWeekend(date) {
        const day = date.getDay();
        return day === 0 || day === 6;
    }

    renderCalendarView() {
        this.safeLog('Rendering calendar view...');
        const calendarGrid = document.getElementById('calendarGrid');
        if (!calendarGrid) {
            this.safeLog('❌ Calendar grid element not found', 'error');
            return;
        }

        const weekDates = this.getWeekDates(this.currentWeekStart);

        const weekPicker = document.getElementById('weekPicker');
        const weekRange = document.getElementById('weekRange');

        if (weekPicker) weekPicker.value = this.formatDate(this.currentWeekStart);
        if (weekRange) weekRange.textContent = `${this.formatShortDate(weekDates[0])} - ${this.formatShortDate(weekDates[6])}`;

        let html = '';

        weekDates.forEach(date => {
            const dateStr = this.formatDate(date);
            const dayEntries = this.entries.get(dateStr) || [];
            const dayTotalHours = dayEntries.reduce((sum, entry) => sum + parseFloat(entry.hours || 0), 0);
            const isWeekend = this.isWeekend(date);

            this.safeLog(`Rendering date ${dateStr}: ${dayEntries.length} entries, weekend: ${isWeekend}`);

            html += `
                <div class="calendar-day ${isWeekend ? 'weekend-day' : ''}" data-date="${dateStr}">
                    <div class="calendar-day-header">
                        <div>
                            <div class="day-name">${date.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                            <div class="day-date">${this.formatDisplayDate(date)}</div>
                        </div>
                        <div class="day-total">${dayTotalHours.toFixed(1)}h</div>
                    </div>

                    <div class="entries-list">
                        ${dayEntries.length > 0 ?
                    dayEntries.map(entry => this.renderEntryItem(entry)).join('') :
                    `<div class="empty-state">
                                <i class="fas fa-calendar-plus"></i>
                                <div>No entries yet</div>
                                <div style="font-size: 10px; margin-top: 5px; color: #999;">
                                    Click "Add Entry" to create one
                                </div>
                            </div>`
                }
                    </div>

                    <button class="add-entry-btn" data-date="${dateStr}">
                        <i class="fas fa-plus"></i> Add Entry
                    </button>
                </div>
            `;
        });

        calendarGrid.innerHTML = html;

        // Bind events to dynamically created elements
        this.bindDynamicEvents();
        this.updateWeekSummary();
        this.safeLog('✅ Calendar view rendered');
    }

    bindDynamicEvents() {
        document.querySelectorAll('.edit-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const entryItem = e.target.closest('.entry-item');
                if (entryItem) {
                    const entryId = entryItem.getAttribute('data-entry-id');
                    this.editEntry(entryId);
                }
            });
        });

        document.querySelectorAll('.delete-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const entryItem = e.target.closest('.entry-item');
                if (entryItem) {
                    const entryId = entryItem.getAttribute('data-entry-id');
                    this.deleteEntry(entryId);
                }
            });
        });

        document.querySelectorAll('.add-entry-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const date = e.target.getAttribute('data-date');
                this.openEntryModal(date);
            });
        });
    }

    renderEntryItem(entry) {
        const activityClass = this.getActivityTypeName(entry.activityType).toLowerCase().replace(/ /g, '_');
        const displayCustomer = entry.customer && entry.customer !== 'null' ? entry.customer : 'No customer';
        const displayWorkItem = entry.workItem && entry.workItem !== 'null' ? entry.workItem : 'No work item';
        const displayComment = entry.comment && entry.comment !== 'null' ? entry.comment : '';

        return `
            <div class="entry-item ${activityClass}" data-entry-id="${entry.id}">
                <div class="entry-header">
                    <div class="entry-customer" title="${displayCustomer}">${this.truncateText(displayCustomer, 20)}</div>
                    <div class="entry-hours">${entry.hours}h</div>
                </div>
                <div class="entry-details">
                    <span class="entry-activity">${this.getActivityTypeName(entry.activityType)}</span>
                    <span title="${displayWorkItem}">${this.truncateText(displayWorkItem, 25)}</span>
                    ${displayComment ? `<br><small title="${displayComment}">${this.truncateText(displayComment, 30)}</small>` : ''}
                </div>
                <div class="entry-actions">
                    <button class="edit-entry" title="Edit entry">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-entry" title="Delete entry">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    getActivityTypeName(value) {
        const types = {
            0: 'Vacation', 1: 'Billable', 2: 'Holding', 3: 'Education',
            4: 'Work Reduction', 5: 'TBD', 6: 'Holiday', 7: 'Presales',
            8: 'Illness', 9: 'Paid Not Worked', 10: 'Intellectual Capital',
            11: 'Business Development', 12: 'Overhead'
        };
        return types[value] || 'Unknown';
    }

    updateWeekSummary() {
        let totalHours = 0;
        let totalEntries = 0;

        this.entries.forEach((dayEntries) => {
            totalEntries += dayEntries.length;
            dayEntries.forEach(entry => {
                totalHours += parseFloat(entry.hours) || 0;
            });
        });

        const weekTotalHours = document.getElementById('weekTotalHours');
        const weekTotalEntries = document.getElementById('weekTotalEntries');

        if (weekTotalHours) weekTotalHours.textContent = totalHours.toFixed(1);
        if (weekTotalEntries) weekTotalEntries.textContent = totalEntries;
    }

    openEntryModal(date) {
        this.currentEditingDate = date;
        this.currentEditingEntry = null;
        this.isEditing = false;

        const modal = document.getElementById('entryModal');
        const modalDate = document.getElementById('modalDate');
        const modalTitle = document.getElementById('modalTitle');

        if (modalDate) modalDate.textContent = this.formatDisplayDate(new Date(date));
        if (modalTitle) modalTitle.textContent = 'Add Entry for';

        const saveEntryBtn = document.getElementById('saveEntry');
        const updateEntryBtn = document.getElementById('updateEntry');
        const addAnotherBtn = document.getElementById('addAnother');

        if (saveEntryBtn) saveEntryBtn.style.display = 'block';
        if (updateEntryBtn) updateEntryBtn.style.display = 'none';
        if (addAnotherBtn) addAnotherBtn.style.display = 'block';

        this.fillFormWithData(this.lastEntryData);

        // Setup autocomplete for the form
        this.setupFormAutocomplete();

        if (modal) modal.style.display = 'block';
    }

    editEntry(entryId) {
        let foundEntry = null;
        let foundDate = null;

        for (const [date, entries] of this.entries.entries()) {
            const entry = entries.find(e => e.id === entryId);
            if (entry) {
                foundEntry = entry;
                foundDate = date;
                break;
            }
        }

        if (!foundEntry) {
            this.showNotification('Entry not found', 'error');
            return;
        }

        this.currentEditingDate = foundDate;
        this.currentEditingEntry = foundEntry;
        this.isEditing = true;

        const modal = document.getElementById('entryModal');
        const modalDate = document.getElementById('modalDate');
        const modalTitle = document.getElementById('modalTitle');

        if (modalDate) modalDate.textContent = this.formatDisplayDate(new Date(foundDate));
        if (modalTitle) modalTitle.textContent = 'Edit Entry for';

        const saveEntryBtn = document.getElementById('saveEntry');
        const updateEntryBtn = document.getElementById('updateEntry');
        const addAnotherBtn = document.getElementById('addAnother');

        if (saveEntryBtn) saveEntryBtn.style.display = 'none';
        if (updateEntryBtn) updateEntryBtn.style.display = 'block';
        if (addAnotherBtn) addAnotherBtn.style.display = 'none';

        this.fillFormWithData(foundEntry);

        if (modal) modal.style.display = 'block';
    }

    fillFormWithData(data) {
        const activityType = document.getElementById('activityType');
        const customer = document.getElementById('customer');
        const workItem = document.getElementById('workItem');
        const comment = document.getElementById('comment');
        const hours = document.getElementById('hours');

        if (activityType) activityType.value = data.activityType || '1';
        if (customer) customer.value = data.customer || '';
        if (workItem) workItem.value = data.workItem || '';
        if (comment) comment.value = data.comment || '';
        if (hours) hours.value = data.hours || '8';
    }

    async deleteEntry(entryId) {
        let entryToDelete = null;
        let entryDate = null;

        for (const [date, entries] of this.entries.entries()) {
            const entry = entries.find(e => e.id === entryId);
            if (entry) {
                entryToDelete = entry;
                entryDate = date;
                break;
            }
        }

        if (!entryToDelete) {
            this.showNotification('Entry not found', 'error');
            return;
        }

        const confirmation = confirm(
            `Are you sure you want to delete this entry?\n\n` +
            `Customer: ${entryToDelete.customer}\n` +
            `Work Item: ${entryToDelete.workItem}\n` +
            `Hours: ${entryToDelete.hours}\n` +
            `Activity: ${this.getActivityTypeName(entryToDelete.activityType)}`
        );

        if (!confirmation) {
            return;
        }

        this.showLoading('Deleting entry...');

        try {
            await this.mondayClient.deleteItem(entryId);
            this.showNotification('Entry deleted successfully!', 'success');

            // Remove from local entries
            if (entryDate) {
                const dayEntries = this.entries.get(entryDate) || [];
                const updatedEntries = dayEntries.filter(entry => entry.id !== entryId);
                this.entries.set(entryDate, updatedEntries);
            }

            this.renderCalendarView();
        } catch (error) {
            this.showNotification(`Failed to delete entry: ${error.message}`, 'error');
            this.safeLog(`Delete entry failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    closeModal() {
        const modal = document.getElementById('entryModal');
        if (modal) modal.style.display = 'none';
        this.currentEditingDate = null;
        this.currentEditingEntry = null;
        this.isEditing = false;
        this.hideSuggestions();
    }

    async saveEntry(addAnother = false) {
        const form = document.getElementById('entryForm');
        if (!form || !form.checkValidity()) {
            if (form) form.reportValidity();
            return;
        }

        const activityType = document.getElementById('activityType');
        const customer = document.getElementById('customer');
        const workItem = document.getElementById('workItem');
        const comment = document.getElementById('comment');
        const hours = document.getElementById('hours');

        if (!activityType || !customer || !workItem || !hours) {
            this.showNotification('Form elements not found', 'error');
            return;
        }

        const entry = {
            date: this.currentEditingDate,
            activityType: activityType.value,
            customer: customer.value.trim(),
            workItem: workItem.value.trim(),
            comment: comment.value.trim(),
            hours: hours.value
        };

        this.lastEntryData = { ...entry };

        // Learn from this new entry
        this.addCustomerWorkPair(entry.customer, entry.workItem);

        if (!this.user) {
            this.showNotification('Please save your API key first', 'warning');
            return;
        }

        this.showLoading('Saving entry...');

        try {
            const currentYear = new Date().getFullYear().toString();
            const board = await this.mondayClient.getBoardWithGroups('6500270039');
            const groupId = this.getYearGroupId(board, currentYear) || 'new_group_mkkbbd2q';

            const columnValues = {
                person: {
                    personsAndTeams: [{ id: this.user.id, kind: "person" }]
                },
                date4: { date: entry.date },
                status: { index: parseInt(entry.activityType) },
                text__1: entry.customer,
                text8__1: entry.workItem,
                numbers__1: entry.hours.toString()
            };

            if (entry.comment) {
                columnValues.text2__1 = entry.comment;
            }

            await this.mondayClient.createItem(
                '6500270039',
                groupId,
                this.user.name,
                JSON.stringify(columnValues)
            );

            this.showNotification('Entry saved successfully!', 'success');

            if (addAnother) {
                const customerInput = document.getElementById('customer');
                if (customerInput) customerInput.focus();
            } else {
                this.closeModal();
                await this.loadData();
            }
        } catch (error) {
            this.showNotification(`Failed to save entry: ${error.message}`, 'error');
            this.safeLog(`Save entry failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async updateEntry() {
        const form = document.getElementById('entryForm');
        if (!form || !form.checkValidity()) {
            if (form) form.reportValidity();
            return;
        }

        if (!this.currentEditingEntry) {
            this.showNotification('No entry selected for editing', 'error');
            return;
        }

        const activityType = document.getElementById('activityType');
        const customer = document.getElementById('customer');
        const workItem = document.getElementById('workItem');
        const comment = document.getElementById('comment');
        const hours = document.getElementById('hours');

        if (!activityType || !customer || !workItem || !hours) {
            this.showNotification('Form elements not found', 'error');
            return;
        }

        const updatedEntry = {
            id: this.currentEditingEntry.id,
            activityType: activityType.value,
            customer: customer.value.trim(),
            workItem: workItem.value.trim(),
            comment: comment.value.trim(),
            hours: hours.value
        };

        this.showLoading('Updating entry...');

        try {
            const columnValues = {
                status: { index: parseInt(updatedEntry.activityType) },
                text__1: updatedEntry.customer,
                text8__1: updatedEntry.workItem,
                numbers__1: updatedEntry.hours.toString()
            };

            if (updatedEntry.comment) {
                columnValues.text2__1 = updatedEntry.comment;
            }

            await this.mondayClient.updateItem(
                updatedEntry.id,
                JSON.stringify(columnValues)
            );

            this.showNotification('Entry updated successfully!', 'success');
            this.closeModal();
            await this.loadData();
        } catch (error) {
            this.showNotification(`Failed to update entry: ${error.message}`, 'error');
            this.safeLog(`Update entry failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    openMultiEntryModal() {
        const weekDates = this.getWeekDates(this.currentWeekStart);
        if (weekDates.length > 0) {
            this.openEntryModal(this.formatDate(weekDates[0]));
        }
    }

    clearAllEntries() {
        if (confirm('Are you sure you want to clear all unsaved entries from the form?')) {
            const form = document.getElementById('entryForm');
            if (form) form.reset();
            this.lastEntryData = {};
            this.showNotification('Form cleared', 'success');
        }
    }

    async saveApiKey() {
        const apiKeyInput = document.getElementById('apiKey');
        if (!apiKeyInput) return;

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            this.showNotification('Please enter an API key', 'error');
            return;
        }

        this.showLoading('Validating API key...');

        try {
            this.mondayClient.setApiKey(apiKey);
            this.user = await this.mondayClient.getCurrentUser();

            localStorage.setItem('mondayApiKey', apiKey);
            this.showNotification('API key saved and validated successfully!', 'success');

            const userInfo = document.getElementById('userInfo');
            const userName = document.getElementById('userName');
            const userEmail = document.getElementById('userEmail');
            const currentYear = document.getElementById('currentYear');

            if (userInfo) userInfo.style.display = 'block';
            if (userName) userName.textContent = `User: ${this.user.name}`;
            if (userEmail) userEmail.textContent = `Email: ${this.user.email}`;
            if (currentYear) currentYear.textContent = `Year: ${new Date().getFullYear()}`;

            await this.loadData();
        } catch (error) {
            this.showNotification(`Failed to validate API key: ${error.message}`, 'error');
            this.safeLog(`API Key validation failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    loadStoredApiKey() {
        const storedKey = localStorage.getItem('mondayApiKey');
        const apiKeyInput = document.getElementById('apiKey');
        if (storedKey && apiKeyInput) {
            apiKeyInput.value = storedKey;
        }
    }

    async loadData() {
        this.safeLog('Starting loadData...');

        if (!this.user) {
            this.safeLog('No user found - cannot load data', 'warn');
            this.showNotification('Please save your API key first', 'warning');
            this.hideLoading();
            return;
        }

        this.updateStatus('Loading Data', 'loading');
        this.showLoading('Loading weekly entries...', 'Initializing data fetch...');

        try {
            const currentYear = new Date().getFullYear().toString();
            this.safeLog(`Loading data for year: ${currentYear} and user: ${this.user.name} (ID: ${this.user.id})`);
            this.updateLoadingDetails('Getting board information...');

            const board = await this.mondayClient.getBoardWithGroups('6500270039');
            this.updateLoadingDetails('Processing board structure...');

            if (!board || !board.groups) {
                throw new Error('No board data found');
            }

            const groupId = this.getYearGroupId(board, currentYear);
            this.safeLog(`Using group ID: ${groupId}`);
            this.updateLoadingDetails(`Target group: ${groupId}`);

            if (!groupId) {
                throw new Error(`Could not find group for year ${currentYear}`);
            }

            let items = [];
            this.updateLoadingDetails('Querying items from Monday.com...');

            // High-performance progress callback
            const progressCallback = (totalItems, pageItems, currentPage) => {
                requestAnimationFrame(() => {
                    const detailsText = `Loaded ${totalItems} items... (Page ${currentPage})`;
                    this.updateLoadingDetails(detailsText);

                    // Update main loading message for significant progress
                    if (totalItems % 500 === 0 || currentPage === 1) {
                        this.showLoading('Loading items from Monday.com...', detailsText);
                    }
                });
            };

            // Try optimized paginated query first (500 items per page, 1ms delay)
            try {
                this.updateLoadingDetails('Starting high-performance query...');
                this.showLoading('Loading items...', 'Starting high-speed data retrieval...');
                this.safeLog(`🚀 Attempting high-performance paginated query (500 items/page)...`);

                const startTime = Date.now();
                items = await this.mondayClient.queryItemsPaginated('6500270039', groupId, progressCallback);
                const loadTime = Date.now() - startTime;

                if (items.length > 0) {
                    this.safeLog(`✅ High-performance query successful: ${items.length} items loaded in ${loadTime}ms`);
                    this.showNotification(`Loaded ${items.length} items in ${loadTime}ms`, 'success');
                } else {
                    this.safeLog(`⚠️ Query returned 0 items`, 'warn');
                    this.showNotification('No items found in the current year group', 'warning');
                }
            } catch (error) {
                this.safeLog(`❌ High-performance query failed: ${error.message}`, 'warn');

                // Fallback to smaller page size if 500 fails
                this.safeLog('🔄 Falling back to standard page size...');
                this.updateLoadingDetails('Falling back to standard query...');

                // We'd need to modify MondayClient to accept page size parameter
                // For now, we'll just rethrow the error
                throw error;
            }

            this.safeLog(`📊 Final item count: ${items.length}`);

            if (items.length === 0) {
                this.showNotification('No items found in Monday.com board. Please check if the board has items in the current year group.', 'warning');
                this.updateStatus('Ready');
                return;
            }

            this.updateLoadingDetails(`Processing ${items.length} items...`);
            this.showLoading('Processing items...', `Analyzing ${items.length} items for current week...`);

            // Process items in chunks to avoid blocking UI
            await this.processItemsWithDebug(items);

            this.updateLoadingDetails('Rendering calendar view...');
            this.showLoading('Rendering calendar...', 'Finalizing display...');

            this.renderCalendarView();

            this.safeLog(`✅ Data load completed - Found entries for ${this.entries.size} dates`);
            this.showNotification(`Loaded ${this.entries.size} days with entries from ${items.length} total items`, 'success');
            this.updateStatus('Ready');

        } catch (error) {
            this.safeLog(`❌ Data loading failed: ${error.message}`, 'error');
            this.showNotification(`Failed to load data: ${error.message}`, 'error');
            this.updateStatus('Error', 'error');
        } finally {
            // Always hide loading overlay
            this.hideLoading();
        }
    }

    // Enhanced processItems to learn from existing entries
    processItemsWithDebug(items) {
        this.entries.clear();
        this.safeLog(`🔍 DEBUG: Starting to process ${items.length} items`);

        const currentWeekDates = this.getWeekDates(this.currentWeekStart).map(date => this.formatDate(date));
        this.safeLog(`📅 Current week dates being checked: ${currentWeekDates.join(', ')}`);

        let userMatchCount = 0;
        let dateExtractedCount = 0;
        let currentWeekEntries = 0;

        this.safeLog(`👤 Looking for items assigned to user: ${this.user.name} (ID: ${this.user.id})`);

        // Process items in chunks to avoid blocking UI
        const chunkSize = 100;
        for (let i = 0; i < items.length; i += chunkSize) {
            const chunk = items.slice(i, i + chunkSize);

            // Allow UI updates between chunks
            if (i > 0 && i % 500 === 0) {
                setTimeout(() => {
                    this.updateLoadingDetails(`Processing items... (${i}/${items.length})`);
                }, 0);
            }

            chunk.forEach(item => {
                const userCheck = this.debugIsUserItem(item);
                if (userCheck.isMatch) {
                    userMatchCount++;
                    const date = this.extractItemDate(item);

                    if (date) {
                        if (currentWeekDates.includes(date)) {
                            dateExtractedCount++;
                            currentWeekEntries++;

                            if (!this.entries.has(date)) {
                                this.entries.set(date, []);
                            }

                            const entryData = {
                                id: item.id,
                                activityType: this.extractStatusValue(item),
                                customer: this.extractColumnValue(item, 'text__1'),
                                workItem: this.extractColumnValue(item, 'text8__1'),
                                comment: this.extractCommentValue(item),
                                hours: this.extractColumnValue(item, 'numbers__1')
                            };

                            this.entries.get(date).push(entryData);

                            // Learn from this entry - add to customer-work pairs
                            this.addCustomerWorkPair(entryData.customer, entryData.workItem);
                        }
                    }
                }
            });
        }

        this.safeLog(`📊 PROCESSING SUMMARY: ${userMatchCount} user matches, ${dateExtractedCount} with dates, ${currentWeekEntries} current week entries`);
        this.safeLog(`💡 Learned ${this.customerWorkPairs.size} customer-work item pairs from data`);
    }

    debugIsUserItem(item) {
        if (!this.user) {
            return { isMatch: false, reason: 'No user' };
        }

        // Check if item name contains user name
        if (item.name && item.name.includes(this.user.name)) {
            return { isMatch: true, reason: 'Name match' };
        }

        // Check person column
        if (item.column_values) {
            for (const col of item.column_values) {
                if (col.id === 'person') {
                    if (col.value && col.value !== 'null' && col.value !== '""') {
                        try {
                            const personData = JSON.parse(col.value);
                            if (personData.personsAndTeams && Array.isArray(personData.personsAndTeams)) {
                                const isUser = personData.personsAndTeams.some(person =>
                                    person.id === this.user.id
                                );
                                if (isUser) return { isMatch: true, reason: 'Person ID match' };
                            }
                        } catch (e) {
                            // Continue to next check
                        }
                    }

                    if (col.text && (col.text.includes(this.user.name) || col.text.includes(this.user.email))) {
                        return { isMatch: true, reason: 'Person text match' };
                    }
                }
            }
        }

        return {
            isMatch: false,
            reason: `No match - item: "${item.name}", user: ${this.user.name} (${this.user.id})`
        };
    }

    updateLoadingDetails(details) {
        const detailsElement = document.getElementById('loadingDetails');
        if (detailsElement) {
            detailsElement.textContent = details;
            // Force UI update
            detailsElement.style.display = 'none';
            detailsElement.offsetHeight; // Trigger reflow
            detailsElement.style.display = 'block';
        }
    }

    getYearGroupId(board, year) {
        if (!board || !board.groups) {
            return null;
        }

        // Look for exact year match
        let group = board.groups.find(g => g.title === year);
        if (group) return group.id;

        // Look for current year
        const currentYear = new Date().getFullYear().toString();
        group = board.groups.find(g => g.title === currentYear);
        if (group) return group.id;

        // Look for partial match
        group = board.groups.find(g => g.title.includes(year));
        if (group) return group.id;

        // Use first group as fallback
        if (board.groups.length > 0) {
            return board.groups[0].id;
        }

        return null;
    }

    extractItemDate(item) {
        if (!item.column_values) return null;

        for (const col of item.column_values) {
            if (col.id === 'date4') {
                if (col.value && col.value !== 'null' && col.value !== '""') {
                    try {
                        const value = JSON.parse(col.value);
                        if (value && value.date) {
                            return value.date.split('T')[0];
                        }
                    } catch (e) {
                        // Continue to text check
                    }
                }

                if (col.text && col.text !== 'null' && col.text !== '""') {
                    const dateStr = col.text.split('T')[0];
                    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        return dateStr;
                    }
                }
            }
        }

        return null;
    }

    extractColumnValue(item, columnId) {
        if (!item.column_values) return '';

        for (const col of item.column_values) {
            if (col.id === columnId) {
                if (col.text && col.text !== 'null' && col.text !== '""') {
                    return col.text;
                }
                if (col.value && col.value !== 'null' && col.value !== '""') {
                    try {
                        const value = JSON.parse(col.value);
                        if (typeof value === 'string') return value;
                        if (value && value.text) return value.text;
                    } catch (e) {
                        return col.value;
                    }
                }
            }
        }

        return '';
    }

    extractCommentValue(item) {
        return this.extractColumnValue(item, 'text2__1');
    }

    extractStatusValue(item) {
        if (!item.column_values) return 1;

        for (const col of item.column_values) {
            if (col.id === 'status' && col.value && col.value !== 'null' && col.value !== '""') {
                try {
                    const value = JSON.parse(col.value);
                    if (value && typeof value.index === 'number') {
                        return value.index;
                    }
                } catch (e) {
                    // Fallback to text parsing if JSON parsing fails
                    if (col.text) {
                        const text = col.text.toLowerCase();
                        const statusMap = {
                            'vacation': 0, 'billable': 1, 'holding': 2, 'education': 3,
                            'work reduction': 4, 'tbd': 5, 'holiday': 6, 'presales': 7,
                            'illness': 8, 'paid not worked': 9, 'intellectual capital': 10,
                            'business development': 11, 'overhead': 12
                        };
                        for (const [key, value] of Object.entries(statusMap)) {
                            if (text.includes(key)) return value;
                        }
                    }
                }
            }
        }
        return 1;
    }

    previousWeek() {
        this.currentWeekStart.setDate(this.currentWeekStart.getDate() - 7);
        this.renderCalendarView();
        this.loadData();
    }

    nextWeek() {
        this.currentWeekStart.setDate(this.currentWeekStart.getDate() + 7);
        this.renderCalendarView();
        this.loadData();
    }

    selectWeek(dateString) {
        this.currentWeekStart = this.getMonday(new Date(dateString));
        this.renderCalendarView();
        this.loadData();
    }

    showLoading(message = 'Loading...', details = '') {
        const loadingOverlay = document.getElementById('loadingOverlay');
        const loadingMessage = document.getElementById('loadingMessage');
        const loadingDetails = document.getElementById('loadingDetails');

        if (loadingMessage) {
            loadingMessage.textContent = message;
            // Force UI update
            loadingMessage.style.display = 'none';
            loadingMessage.offsetHeight;
            loadingMessage.style.display = 'block';
        }

        if (loadingDetails) {
            loadingDetails.textContent = details;
            // Force UI update
            loadingDetails.style.display = 'none';
            loadingDetails.offsetHeight;
            loadingDetails.style.display = 'block';
        }

        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        if (!notification) return;

        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');

        setTimeout(() => {
            notification.classList.add('hidden');
        }, 5000);
    }

    // Autocomplete functionality
    initializeAutocomplete() {
        // This will be called when the modal opens
    }

    setupFormAutocomplete() {
        const customerInput = document.getElementById('customer');
        const workItemInput = document.getElementById('workItem');

        if (customerInput) {
            // Clear previous event listeners
            customerInput.removeEventListener('input', this.customerInputHandler);
            customerInput.removeEventListener('focus', this.customerFocusHandler);

            this.customerInputHandler = (e) => this.handleCustomerInput(e);
            this.customerFocusHandler = () => this.showCustomerSuggestions();

            customerInput.addEventListener('input', this.customerInputHandler);
            customerInput.addEventListener('focus', this.customerFocusHandler);
        }

        if (workItemInput) {
            workItemInput.removeEventListener('focus', this.workItemFocusHandler);
            this.workItemFocusHandler = () => this.showWorkItemSuggestions();
            workItemInput.addEventListener('focus', this.workItemFocusHandler);
        }
    }

    handleCustomerInput(e) {
        const customer = e.target.value.trim();
        if (customer.length > 1) {
            this.showCustomerSuggestions();
        } else {
            this.hideSuggestions();
        }
    }

    showCustomerSuggestions() {
        const customerInput = document.getElementById('customer');
        if (!customerInput) return;

        const customers = this.getCustomers();
        const filtered = customers.filter(c =>
            c.toLowerCase().includes(customerInput.value.toLowerCase())
        );

        this.showSuggestions(customerInput, filtered, (selectedCustomer) => {
            customerInput.value = selectedCustomer;
            this.showWorkItemSuggestions();
        });
    }

    showWorkItemSuggestions() {
        const customerInput = document.getElementById('customer');
        const workItemInput = document.getElementById('workItem');
        if (!customerInput || !workItemInput) return;

        const customer = customerInput.value.trim();
        if (!customer) return;

        const workItems = this.getWorkItemsForCustomer(customer);
        const filtered = workItems.filter(w =>
            w.toLowerCase().includes(workItemInput.value.toLowerCase())
        );

        this.showSuggestions(workItemInput, filtered, (selectedWorkItem) => {
            workItemInput.value = selectedWorkItem;
        });
    }

    showSuggestions(inputElement, suggestions, onSelect) {
        this.hideSuggestions();

        if (suggestions.length === 0) return;

        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'autocomplete-suggestions';
        suggestionsDiv.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            width: ${inputElement.offsetWidth}px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;

        suggestions.forEach(suggestion => {
            const suggestionItem = document.createElement('div');
            suggestionItem.textContent = suggestion;
            suggestionItem.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid #f0f0f0;
            `;
            suggestionItem.addEventListener('mouseenter', () => {
                suggestionItem.style.background = '#f0f0f0';
            });
            suggestionItem.addEventListener('mouseleave', () => {
                suggestionItem.style.background = 'white';
            });
            suggestionItem.addEventListener('click', () => {
                onSelect(suggestion);
                this.hideSuggestions();
            });
            suggestionsDiv.appendChild(suggestionItem);
        });

        const rect = inputElement.getBoundingClientRect();
        suggestionsDiv.style.top = `${rect.bottom + window.scrollY}px`;
        suggestionsDiv.style.left = `${rect.left + window.scrollX}px`;

        document.body.appendChild(suggestionsDiv);

        // Close suggestions when clicking outside
        this.suggestionsClickHandler = (e) => {
            if (!suggestionsDiv.contains(e.target) && e.target !== inputElement) {
                this.hideSuggestions();
            }
        };
        document.addEventListener('click', this.suggestionsClickHandler);
    }

    hideSuggestions() {
        const existing = document.querySelector('.autocomplete-suggestions');
        if (existing) {
            existing.remove();
        }
        if (this.suggestionsClickHandler) {
            document.removeEventListener('click', this.suggestionsClickHandler);
            this.suggestionsClickHandler = null;
        }
    }

    // Enhanced Customer-work pairs management modal
    openCustomerWorkPairsModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        const allPairs = this.getAllCustomerWorkPairs();

        modal.innerHTML = `
            <div class="modal-content" style="background: white; padding: 20px; border-radius: 8px; max-width: 800px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3>Manage Customer-Work Item Pairs</h3>
                    <button class="close-modal" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                
                <div class="modal-body">
                    <!-- Add New Pair Form -->
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                        <h4 style="margin-bottom: 10px;">Add New Customer-Work Pair</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end;">
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Customer</label>
                                <input type="text" id="newCustomer" placeholder="Enter customer name" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Work Item</label>
                                <input type="text" id="newWorkItem" placeholder="Enter work item" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                            </div>
                            <div>
                                <button id="addNewPair" class="btn-primary" style="padding: 8px 16px;">Add Pair</button>
                            </div>
                        </div>
                    </div>

                    <!-- Management Controls -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <div>
                            <span style="font-weight: 500;">Active: ${allPairs.active.length} | Expired: ${allPairs.expired.length}</span>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button id="exportPairs" class="btn-secondary">Export Pairs</button>
                            <button id="importPairs" class="btn-secondary">Import Pairs</button>
                            <input type="file" id="importFile" accept=".json" style="display: none;">
                        </div>
                    </div>

                    <!-- Active Pairs Section -->
                    <div style="margin-bottom: 30px;">
                        <h4 style="color: #27ae60; margin-bottom: 10px;">Active Pairs (${allPairs.active.length})</h4>
                        <div style="max-height: 300px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 5px;">
                            ${allPairs.active.length > 0 ?
                allPairs.active.map((pair, index) => `
                                    <div class="pair-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee; background: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                                        <div style="flex: 1;">
                                            <strong>${pair.customer}</strong> - ${pair.workItem}
                                        </div>
                                        <div style="display: flex; gap: 5px;">
                                            <button class="edit-pair btn-secondary" data-customer="${pair.customer}" data-workitem="${pair.workItem}" style="padding: 4px 8px; font-size: 12px;">
                                                Edit
                                            </button>
                                            <button class="mark-expired btn-secondary" data-customer="${pair.customer}" data-workitem="${pair.workItem}" style="padding: 4px 8px; font-size: 12px;">
                                                Mark Expired
                                            </button>
                                        </div>
                                    </div>
                                `).join('') :
                '<p style="text-align: center; color: #666; padding: 20px;">No active customer-work item pairs found.</p>'
            }
                        </div>
                    </div>

                    <!-- Expired Pairs Section -->
                    <div>
                        <h4 style="color: #e74c3c; margin-bottom: 10px;">Expired Pairs (${allPairs.expired.length})</h4>
                        <div style="max-height: 200px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 5px;">
                            ${allPairs.expired.length > 0 ?
                allPairs.expired.map((pair, index) => `
                                    <div class="pair-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee; background: ${index % 2 === 0 ? '#f8f9fa' : 'white'}; opacity: 0.7;">
                                        <div style="flex: 1;">
                                            <strong>${pair.customer}</strong> - ${pair.workItem}
                                        </div>
                                        <div style="display: flex; gap: 5px;">
                                            <button class="unmark-expired btn-secondary" data-customer="${pair.customer}" data-workitem="${pair.workItem}" style="padding: 4px 8px; font-size: 12px;">
                                                Reactivate
                                            </button>
                                            <button class="delete-pair btn-secondary" data-customer="${pair.customer}" data-workitem="${pair.workItem}" style="padding: 4px 8px; font-size: 12px; background: #e74c3c;">
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                `).join('') :
                '<p style="text-align: center; color: #666; padding: 20px;">No expired customer-work item pairs found.</p>'
            }
                        </div>
                    </div>
                </div>

                <div class="modal-footer" style="margin-top: 20px; text-align: right;">
                    <button id="closePairsModal" class="btn-primary">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event handlers for the modal
        const closeModal = () => modal.remove();
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.querySelector('#closePairsModal').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Add new pair functionality
        modal.querySelector('#addNewPair').addEventListener('click', () => {
            const newCustomer = modal.querySelector('#newCustomer').value.trim();
            const newWorkItem = modal.querySelector('#newWorkItem').value.trim();

            if (!newCustomer || !newWorkItem) {
                this.showNotification('Please enter both customer and work item', 'error');
                return;
            }

            this.addCustomerWorkPair(newCustomer, newWorkItem);
            this.showNotification(`Added new pair: ${newCustomer} - ${newWorkItem}`, 'success');

            // Clear inputs
            modal.querySelector('#newCustomer').value = '';
            modal.querySelector('#newWorkItem').value = '';

            // Refresh the modal
            closeModal();
            this.openCustomerWorkPairsModal();
        });

        // Export functionality
        modal.querySelector('#exportPairs').addEventListener('click', () => {
            this.exportCustomerWorkPairs();
        });

        // Import functionality
        modal.querySelector('#importPairs').addEventListener('click', () => {
            modal.querySelector('#importFile').click();
        });

        modal.querySelector('#importFile').addEventListener('change', (e) => {
            this.importCustomerWorkPairs(e.target.files[0]);
            closeModal();
        });

        // Edit pair functionality
        modal.querySelectorAll('.edit-pair').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const customer = e.target.getAttribute('data-customer');
                const workItem = e.target.getAttribute('data-workitem');
                this.openEditPairModal(customer, workItem, closeModal);
            });
        });

        // Mark as expired functionality
        modal.querySelectorAll('.mark-expired').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const customer = e.target.getAttribute('data-customer');
                const workItem = e.target.getAttribute('data-workitem');
                this.markPairAsExpired(customer, workItem);
                this.showNotification(`Marked ${customer} - ${workItem} as expired`, 'success');
                closeModal();
                this.openCustomerWorkPairsModal();
            });
        });

        // Unmark as expired functionality
        modal.querySelectorAll('.unmark-expired').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const customer = e.target.getAttribute('data-customer');
                const workItem = e.target.getAttribute('data-workitem');
                this.unmarkPairAsExpired(customer, workItem);
                this.addCustomerWorkPair(customer, workItem);
                this.showNotification(`Reactivated ${customer} - ${workItem}`, 'success');
                closeModal();
                this.openCustomerWorkPairsModal();
            });
        });

        // Delete pair functionality
        modal.querySelectorAll('.delete-pair').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const customer = e.target.getAttribute('data-customer');
                const workItem = e.target.getAttribute('data-workitem');

                if (confirm(`Are you sure you want to permanently delete the pair "${customer} - ${workItem}"?`)) {
                    this.expiredPairs.delete(`${customer}|${workItem}`);
                    this.saveCustomerWorkPairs();
                    this.showNotification(`Deleted pair: ${customer} - ${workItem}`, 'success');
                    closeModal();
                    this.openCustomerWorkPairsModal();
                }
            });
        });
    }

    openEditPairModal(oldCustomer, oldWorkItem, onClose) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1001;
        `;

        modal.innerHTML = `
            <div class="modal-content" style="background: white; padding: 20px; border-radius: 8px; max-width: 500px;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3>Edit Customer-Work Pair</h3>
                    <button class="close-edit-modal" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                
                <div class="modal-body">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 500;">Customer</label>
                        <input type="text" id="editCustomer" value="${oldCustomer}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 500;">Work Item</label>
                        <input type="text" id="editWorkItem" value="${oldWorkItem}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                </div>

                <div class="modal-footer" style="margin-top: 20px; text-align: right; display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="cancelEdit" class="btn-secondary">Cancel</button>
                    <button id="saveEdit" class="btn-primary">Save Changes</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeEditModal = () => {
            modal.remove();
            onClose();
            this.openCustomerWorkPairsModal();
        };

        modal.querySelector('.close-edit-modal').addEventListener('click', closeEditModal);
        modal.querySelector('#cancelEdit').addEventListener('click', closeEditModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeEditModal();
        });

        modal.querySelector('#saveEdit').addEventListener('click', () => {
            const newCustomer = modal.querySelector('#editCustomer').value.trim();
            const newWorkItem = modal.querySelector('#editWorkItem').value.trim();

            if (!newCustomer || !newWorkItem) {
                this.showNotification('Please enter both customer and work item', 'error');
                return;
            }

            // Remove old pair
            this.removeCustomerWorkPair(oldCustomer, oldWorkItem);
            this.expiredPairs.delete(`${oldCustomer}|${oldWorkItem}`);

            // Add new pair
            this.addCustomerWorkPair(newCustomer, newWorkItem);

            this.showNotification(`Updated pair: ${oldCustomer} - ${oldWorkItem} → ${newCustomer} - ${newWorkItem}`, 'success');
            closeEditModal();
        });
    }

    exportCustomerWorkPairs() {
        const allPairs = this.getAllCustomerWorkPairs();
        const data = JSON.stringify({
            active: allPairs.active,
            expired: allPairs.expired,
            exportedAt: new Date().toISOString()
        }, null, 2);

        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customer-work-pairs-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification('Customer-work pairs exported successfully', 'success');
    }

    importCustomerWorkPairs(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                let importedCount = 0;

                if (data.active && Array.isArray(data.active)) {
                    data.active.forEach(pair => {
                        if (pair.customer && pair.workItem) {
                            this.addCustomerWorkPair(pair.customer, pair.workItem);
                            importedCount++;
                        }
                    });
                }

                if (data.expired && Array.isArray(data.expired)) {
                    data.expired.forEach(pair => {
                        if (pair.customer && pair.workItem) {
                            this.expiredPairs.add(`${pair.customer}|${pair.workItem}`);
                        }
                    });
                    this.saveCustomerWorkPairs();
                }

                this.showNotification(`Imported ${importedCount} customer-work pairs`, 'success');
                this.openCustomerWorkPairsModal();
            } catch (error) {
                this.showNotification('Failed to import file - invalid format', 'error');
            }
        };
        reader.readAsText(file);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if logger is available
    if (typeof window.diagnosticLogger === 'undefined') {
        console.log('⚠️ Logger not found, using console fallback');
    }

    console.log('📄 DOM Content Loaded - Starting app initialization');
    try {
        new ClaimWebApp();
    } catch (error) {
        console.error('💥 App initialization crashed:', error);
        if (window.diagnosticLogger && window.diagnosticLogger.showLogger) {
            window.diagnosticLogger.showLogger();
        }
    }
});