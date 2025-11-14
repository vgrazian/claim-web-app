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

        this.logger = window.diagnosticLogger;
        this.initializeApp();
    }

    initializeApp() {
        this.logger.log('🚀 Initializing ClaimWebApp...');
        this.updateStatus('Initializing');

        try {
            this.bindEvents();
            this.loadStoredApiKey();
            this.renderCalendarView();
            this.startResponsivenessCheck();
            this.logger.log('✅ App initialized successfully');
            this.updateStatus('Ready');
        } catch (error) {
            this.logger.log(`❌ App initialization failed: ${error.message}`, 'error');
            this.updateStatus('Error', 'error');
        }
    }

    bindEvents() {
        this.logger.log('Binding events...');

        document.getElementById('saveApiKey').addEventListener('click', () => this.saveApiKey());
        document.getElementById('apiKey').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveApiKey();
        });

        document.getElementById('prevWeek').addEventListener('click', () => this.previousWeek());
        document.getElementById('nextWeek').addEventListener('click', () => this.nextWeek());
        document.getElementById('weekPicker').addEventListener('change', (e) => this.selectWeek(e.target.value));
        document.getElementById('queryData').addEventListener('click', () => this.loadData());

        document.getElementById('toggleDebug').addEventListener('click', () => this.toggleDebug());
        document.getElementById('forceLoad').addEventListener('click', () => this.forceLoad());
        document.getElementById('testConnection').addEventListener('click', () => this.testConnection());

        document.querySelector('.close-modal').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelEntry').addEventListener('click', () => this.closeModal());
        document.getElementById('saveEntry').addEventListener('click', () => this.saveEntry());
        document.getElementById('updateEntry').addEventListener('click', () => this.updateEntry());
        document.getElementById('addAnother').addEventListener('click', () => this.saveEntry(true));

        document.getElementById('addMultipleEntries').addEventListener('click', () => this.openMultiEntryModal());
        document.getElementById('clearAll').addEventListener('click', () => this.clearAllEntries());

        document.querySelectorAll('.activity-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const value = e.target.getAttribute('data-value');
                document.getElementById('activityType').value = value;
            });
        });

        document.getElementById('entryModal').addEventListener('click', (e) => {
            if (e.target.id === 'entryModal') {
                this.closeModal();
            }
        });

        this.logger.log('✅ All events bound successfully');
    }

    updateStatus(status, type = 'ready') {
        const statusElement = document.getElementById('appStatus');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `status-indicator ${type}`;
        }
    }

    startResponsivenessCheck() {
        this.logger.log('Starting responsiveness check...');
        this.responsivenessCheck = this.logger.startResponsivenessCheck();
    }

    async testConnection() {
        this.logger.log('Testing Monday.com connection...');
        this.updateStatus('Testing Connection', 'loading');

        try {
            const result = await this.mondayClient.testConnection();
            if (result.success) {
                this.logger.log('✅ Connection test successful');
                this.showNotification('Connection test successful!', 'success');
                this.updateStatus('Ready');
            } else {
                this.logger.log(`❌ Connection test failed: ${result.error}`, 'error');
                this.showNotification(`Connection failed: ${result.error}`, 'error');
                this.updateStatus('Connection Failed', 'error');
            }
        } catch (error) {
            this.logger.log(`❌ Connection test error: ${error.message}`, 'error');
            this.showNotification(`Connection error: ${error.message}`, 'error');
            this.updateStatus('Connection Error', 'error');
        }
    }

    toggleDebug() {
        this.logger.toggleLogger();
    }

    forceLoad() {
        this.logger.log('Force loading data...');
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
        this.logger.log('Rendering calendar view...');
        const calendarGrid = document.getElementById('calendarGrid');
        if (!calendarGrid) {
            this.logger.log('❌ Calendar grid element not found', 'error');
            return;
        }

        const weekDates = this.getWeekDates(this.currentWeekStart);

        document.getElementById('weekPicker').value = this.formatDate(this.currentWeekStart);
        document.getElementById('weekRange').textContent =
            `${this.formatShortDate(weekDates[0])} - ${this.formatShortDate(weekDates[6])}`;

        let html = '';

        weekDates.forEach(date => {
            const dateStr = this.formatDate(date);
            const dayEntries = this.entries.get(dateStr) || [];
            const dayTotalHours = dayEntries.reduce((sum, entry) => sum + parseFloat(entry.hours || 0), 0);
            const isWeekend = this.isWeekend(date);

            this.logger.log(`Rendering date ${dateStr}: ${dayEntries.length} entries, weekend: ${isWeekend}`);

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

        document.querySelectorAll('.edit-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const entryId = e.target.closest('.entry-item').getAttribute('data-entry-id');
                this.editEntry(entryId);
            });
        });

        document.querySelectorAll('.delete-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const entryId = e.target.closest('.entry-item').getAttribute('data-entry-id');
                this.deleteEntry(entryId);
            });
        });

        document.querySelectorAll('.add-entry-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const date = e.target.getAttribute('data-date');
                this.openEntryModal(date);
            });
        });

        this.updateWeekSummary();
        this.logger.log('✅ Calendar view rendered');
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

        document.getElementById('weekTotalHours').textContent = totalHours.toFixed(1);
        document.getElementById('weekTotalEntries').textContent = totalEntries;
    }

    openEntryModal(date) {
        this.currentEditingDate = date;
        this.currentEditingEntry = null;
        this.isEditing = false;

        const modal = document.getElementById('entryModal');
        const modalDate = document.getElementById('modalDate');
        const modalTitle = document.getElementById('modalTitle');

        modalDate.textContent = this.formatDisplayDate(new Date(date));
        modalTitle.textContent = 'Add Entry for';

        document.getElementById('saveEntry').style.display = 'block';
        document.getElementById('updateEntry').style.display = 'none';
        document.getElementById('addAnother').style.display = 'block';

        this.fillFormWithData(this.lastEntryData);

        modal.style.display = 'block';
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

        modalDate.textContent = this.formatDisplayDate(new Date(foundDate));
        modalTitle.textContent = 'Edit Entry for';

        document.getElementById('saveEntry').style.display = 'none';
        document.getElementById('updateEntry').style.display = 'block';
        document.getElementById('addAnother').style.display = 'none';

        this.fillFormWithData(foundEntry);

        modal.style.display = 'block';
    }

    fillFormWithData(data) {
        document.getElementById('activityType').value = data.activityType || '1';
        document.getElementById('customer').value = data.customer || '';
        document.getElementById('workItem').value = data.workItem || '';
        document.getElementById('comment').value = data.comment || '';
        document.getElementById('hours').value = data.hours || '8';
    }

    async deleteEntry(entryId) {
        let entryToDelete = null;
        for (const [date, entries] of this.entries.entries()) {
            const entry = entries.find(e => e.id === entryId);
            if (entry) {
                entryToDelete = entry;
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
            await this.loadData();
        } catch (error) {
            this.showNotification(`Failed to delete entry: ${error.message}`, 'error');
            this.logger.log(`Delete entry failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    closeModal() {
        document.getElementById('entryModal').style.display = 'none';
        this.currentEditingDate = null;
        this.currentEditingEntry = null;
        this.isEditing = false;
    }

    async saveEntry(addAnother = false) {
        const form = document.getElementById('entryForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const entry = {
            date: this.currentEditingDate,
            activityType: document.getElementById('activityType').value,
            customer: document.getElementById('customer').value.trim(),
            workItem: document.getElementById('workItem').value.trim(),
            comment: document.getElementById('comment').value.trim(),
            hours: document.getElementById('hours').value
        };

        this.lastEntryData = { ...entry };

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
                document.getElementById('customer').focus();
            } else {
                this.closeModal();
                await this.loadData();
            }
        } catch (error) {
            this.showNotification(`Failed to save entry: ${error.message}`, 'error');
            this.logger.log(`Save entry failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async updateEntry() {
        const form = document.getElementById('entryForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        if (!this.currentEditingEntry) {
            this.showNotification('No entry selected for editing', 'error');
            return;
        }

        const updatedEntry = {
            id: this.currentEditingEntry.id,
            activityType: document.getElementById('activityType').value,
            customer: document.getElementById('customer').value.trim(),
            workItem: document.getElementById('workItem').value.trim(),
            comment: document.getElementById('comment').value.trim(),
            hours: document.getElementById('hours').value
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
            this.logger.log(`Update entry failed: ${error.message}`, 'error');
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
            document.getElementById('entryForm').reset();
            this.lastEntryData = {};
            this.showNotification('Form cleared', 'success');
        }
    }

    async saveApiKey() {
        const apiKey = document.getElementById('apiKey').value.trim();
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

            document.getElementById('userInfo').style.display = 'block';
            document.getElementById('userName').textContent = `User: ${this.user.name}`;
            document.getElementById('userEmail').textContent = `Email: ${this.user.email}`;
            document.getElementById('currentYear').textContent = `Year: ${new Date().getFullYear()}`;

            await this.loadData();
        } catch (error) {
            this.showNotification(`Failed to validate API key: ${error.message}`, 'error');
            this.logger.log(`API Key validation failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    loadStoredApiKey() {
        const storedKey = localStorage.getItem('mondayApiKey');
        if (storedKey) {
            document.getElementById('apiKey').value = storedKey;
            setTimeout(() => this.saveApiKey(), 1000);
        }
    }

    async loadData() {
        if (!this.user) {
            this.logger.log('No user found - cannot load data', 'warn');
            this.showNotification('Please save your API key first', 'warning');
            return;
        }

        const loadTimer = this.logger.startTimer('loadData');
        this.updateStatus('Loading Data', 'loading');

        this.showLoading('Loading weekly entries...', 'Initializing data fetch...');
        this.logger.setProgress(0, 100, 'Starting data load');

        try {
            const currentYear = new Date().getFullYear().toString();
            this.logger.log(`Loading data for year: ${currentYear} and user: ${this.user.name} (ID: ${this.user.id})`);
            this.updateLoadingDetails('Getting board information...');
            this.logger.setProgress(10, 100, 'Fetching board data');

            const board = await this.mondayClient.getBoardWithGroups('6500270039');
            this.updateLoadingDetails('Processing board structure...');
            this.logger.setProgress(20, 100, 'Processing board');

            if (!board || !board.groups) {
                this.logger.log('No board data found', 'error');
                this.showNotification('No board data found', 'error');
                this.updateStatus('Error', 'error');
                return;
            }

            const groupId = this.getYearGroupId(board, currentYear);
            this.logger.log(`Using group ID: ${groupId}`);
            this.updateLoadingDetails(`Target group: ${groupId}`);
            this.logger.setProgress(30, 100, 'Identified target group');

            if (!groupId) {
                this.logger.log(`Could not find group for year ${currentYear}`, 'warn');
                this.showNotification(`Could not find group for year ${currentYear}`, 'warning');
                this.updateStatus('Ready');
                return;
            }

            let items = [];
            this.updateLoadingDetails('Querying items from Monday.com...');
            this.logger.setProgress(40, 100, 'Querying items');

            const queryMethods = [
                {
                    name: 'simple',
                    method: () => this.mondayClient.queryAllItemsInGroup('6500270039', groupId, 5000)
                },
                {
                    name: 'paginated',
                    method: () => this.mondayClient.queryItemsPaginated('6500270039', groupId, 5000)
                }
            ];

            for (const method of queryMethods) {
                try {
                    this.updateLoadingDetails(`Trying ${method.name} query method...`);
                    this.logger.setProgress(50, 100, `Trying ${method.name} query`);
                    this.logger.log(`🔍 Attempting ${method.name} query...`);
                    items = await method.method();

                    if (items.length > 0) {
                        this.logger.log(`✅ ${method.name} query successful: ${items.length} items found`);
                        break;
                    } else {
                        this.logger.log(`⚠️ ${method.name} query returned 0 items`, 'warn');
                    }
                } catch (error) {
                    this.logger.log(`❌ ${method.name} query failed: ${error.message}`, 'warn');
                }
            }

            this.logger.log(`📊 Final item count from all queries: ${items.length}`);

            if (items.length === 0) {
                this.logger.log('❌ No items found in any query method', 'error');
                this.showNotification('No items found in Monday.com board. Please check if the board has items in the current year group.', 'warning');
                this.updateStatus('Ready');
                return;
            }

            this.updateLoadingDetails(`Processing ${items.length} items...`);
            this.logger.setProgress(70, 100, 'Processing items');

            this.processItemsWithDebug(items);

            this.updateLoadingDetails('Rendering calendar view...');
            this.logger.setProgress(90, 100, 'Rendering UI');
            this.renderCalendarView();

            const duration = this.logger.endTimer(loadTimer);
            this.logger.setProgress(100, 100, 'Complete');
            this.logger.log(`✅ Data load completed in ${duration.toFixed(0)}ms - Found entries for ${this.entries.size} dates`);
            this.showNotification(`Loaded ${items.length} entries for ${this.entries.size} days`, 'success');
            this.updateStatus('Ready');

        } catch (error) {
            this.logger.log(`❌ Data loading failed: ${error.message}`, 'error');
            this.showNotification(`Failed to load data: ${error.message}`, 'error');
            this.updateStatus('Error', 'error');
        } finally {
            this.hideLoading();
            setTimeout(() => this.logger.setProgress(0, 100, 'Ready'), 2000);
        }
    }

    processItemsWithDebug(items) {
        const processTimer = this.logger.startTimer('processItems');
        this.entries.clear();
        this.logger.log(`🔍 DEBUG: Starting to process ${items.length} items`);

        const currentWeekDates = this.getWeekDates(this.currentWeekStart).map(date => this.formatDate(date));
        this.logger.log(`📅 Current week dates being checked: ${currentWeekDates.join(', ')}`);

        let userMatchCount = 0;
        let dateExtractedCount = 0;
        let currentWeekEntries = 0;
        let userMismatchReasons = [];

        this.logger.log(`👤 Looking for items assigned to user: ${this.user.name} (ID: ${this.user.id})`);

        items.forEach((item, index) => {
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

                        this.logger.log(`✅ ADDED: ${date} - ${entryData.customer} (${entryData.hours}h)`, 'debug');
                        this.entries.get(date).push(entryData);
                    } else {
                        this.logger.log(`❌ DATE OUTSIDE WEEK: ${date} for item "${item.name}"`, 'debug');
                    }
                } else {
                    this.logger.log(`❌ NO DATE: Could not extract date for item "${item.name}"`, 'debug');
                    if (item.column_values && item.column_values.length > 0) {
                        const dateColumns = item.column_values.filter(col =>
                            col.id === 'date4' || col.id === 'date'
                        );
                        if (dateColumns.length > 0) {
                            this.logger.log(`   📅 DATE COLUMNS FOR ITEM "${item.name}":`, 'debug');
                            dateColumns.forEach(col => {
                                this.logger.log(`     ${col.id}: value="${col.value}", text="${col.text}"`, 'debug');
                            });
                        }
                    }
                }
            } else {
                userMismatchReasons.push(userCheck.reason);
                if (userMismatchReasons.length <= 3) {
                    this.logger.log(`❌ USER MISMATCH: ${userCheck.reason}`, 'debug');
                }
            }
        });

        this.logger.log(`📊 PROCESSING SUMMARY:`);
        this.logger.log(`   Total items: ${items.length}`);
        this.logger.log(`   User matches: ${userMatchCount}`);
        this.logger.log(`   Items with dates: ${dateExtractedCount}`);
        this.logger.log(`   Current week entries: ${currentWeekEntries}`);

        if (userMismatchReasons.length > 0 && userMismatchReasons.length <= 10) {
            const uniqueReasons = [...new Set(userMismatchReasons)];
            this.logger.log(`   User mismatch reasons (first 10): ${uniqueReasons.slice(0, 10).join(', ')}`);
        } else if (userMismatchReasons.length > 10) {
            this.logger.log(`   User mismatch reasons: ${userMismatchReasons.length} total mismatches`);
        }

        this.logger.log(`📅 FINAL ENTRIES BY DATE:`);
        currentWeekDates.forEach(date => {
            const entries = this.entries.get(date) || [];
            this.logger.log(`   ${date}: ${entries.length} entries`);
            if (entries.length === 0) {
                this.logger.log(`   ⚠️  NO ENTRIES for ${date}`, 'warn');
            }
        });

        this.logger.endTimer(processTimer);
    }

    debugIsUserItem(item) {
        if (!this.user) {
            return { isMatch: false, reason: 'No user' };
        }

        if (item.name && item.name.includes(this.user.name)) {
            return { isMatch: true, reason: 'Name match' };
        }

        if (item.column_values) {
            for (const col of item.column_values) {
                if (col.id === 'person') {
                    this.logger.log(`🔍 Checking person column for item "${item.name}":`, 'debug');
                    this.logger.log(`   Column value: ${col.value}`, 'debug');
                    this.logger.log(`   Column text: ${col.text}`, 'debug');

                    if (col.value && col.value !== 'null' && col.value !== '""') {
                        try {
                            const personData = JSON.parse(col.value);
                            this.logger.log(`   Parsed person data: ${JSON.stringify(personData)}`, 'debug');

                            if (personData.personsAndTeams && Array.isArray(personData.personsAndTeams)) {
                                const isUser = personData.personsAndTeams.some(person => {
                                    const match = person.id === this.user.id;
                                    if (match) {
                                        this.logger.log(`   ✅ Matched by person ID: ${person.id} === ${this.user.id}`, 'debug');
                                    }
                                    return match;
                                });
                                if (isUser) return { isMatch: true, reason: 'Person ID match' };
                            }
                        } catch (e) {
                            this.logger.log(`   Failed to parse person JSON: ${e.message}`, 'debug');
                        }
                    }

                    if (col.text && col.text !== 'null' && col.text !== '""') {
                        if (col.text.includes(this.user.name) || col.text.includes(this.user.email)) {
                            this.logger.log(`   ✅ Matched by person text: ${col.text}`, 'debug');
                            return { isMatch: true, reason: 'Person text match' };
                        }
                    }

                    this.logger.log(`   ❌ Person column exists but no match found`, 'debug');
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
        }
        this.logger.log(`Loading: ${details}`, 'debug');
    }

    getYearGroupId(board, year) {
        if (!board || !board.groups) {
            this.logger.log('No groups found in board', 'warn');
            return null;
        }

        this.logger.log(`🔍 Looking for group for year: ${year}`);
        this.logger.log(`   Available groups: ${board.groups.map(g => `${g.title} (${g.id})`).join(', ')}`);

        let group = board.groups.find(g => g.title === year);
        if (group) {
            this.logger.log(`✅ Found exact year match: ${group.title} (${group.id})`);
            return group.id;
        }

        const currentYear = new Date().getFullYear().toString();
        group = board.groups.find(g => g.title === currentYear);
        if (group) {
            this.logger.log(`✅ Found current year match: ${group.title} (${group.id})`);
            return group.id;
        }

        group = board.groups.find(g => g.title.includes(year));
        if (group) {
            this.logger.log(`✅ Found partial year match: ${group.title} (${group.id})`);
            return group.id;
        }

        if (board.groups.length > 0) {
            this.logger.log(`⚠️ Using first group as fallback: ${board.groups[0].title} (${board.groups[0].id})`);
            return board.groups[0].id;
        }

        this.logger.log('❌ No suitable group found');
        return null;
    }

    processItems(items) {
        this.processItemsWithDebug(items);
    }

    isUserItem(item) {
        const debugResult = this.debugIsUserItem(item);
        return debugResult.isMatch;
    }

    extractItemDate(item) {
        if (!item.column_values) {
            this.logger.log('No column values found for item', 'debug');
            return null;
        }

        for (const col of item.column_values) {
            if (col.id === 'date4') {
                this.logger.log(`🔍 Checking date4 column for item "${item.name}": value="${col.value}", text="${col.text}"`, 'debug');

                if (col.value && col.value !== 'null' && col.value !== '""') {
                    try {
                        const value = JSON.parse(col.value);
                        this.logger.log(`   Parsed date value: ${JSON.stringify(value)}`, 'debug');

                        if (value && value.date) {
                            const dateStr = value.date.split('T')[0];
                            this.logger.log(`✅ Extracted date from JSON value: ${dateStr}`);
                            return dateStr;
                        }
                    } catch (e) {
                        this.logger.log(`   Failed to parse date JSON: ${e.message}`, 'debug');
                    }
                }

                if (col.text && col.text !== 'null' && col.text !== '""') {
                    const dateStr = col.text.split('T')[0];
                    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        this.logger.log(`✅ Extracted date from text field: ${dateStr}`);
                        return dateStr;
                    } else {
                        this.logger.log(`   Invalid date format in text: ${dateStr}`, 'debug');
                    }
                }

                this.logger.log(`❌ Could not extract date from date4 column`);
            }
        }

        this.logger.log(`❌ No date4 column found or no valid date value`);
        return null;
    }

    extractColumnValue(item, columnId) {
        if (!item.column_values) return '';

        for (const col of item.column_values) {
            if (col.id === columnId) {
                this.logger.log(`Found column ${columnId}: value="${col.value}", text="${col.text}"`, 'debug');

                if (col.text && col.text !== 'null' && col.text !== '""') {
                    this.logger.log(`✅ Using text value for ${columnId}: ${col.text}`);
                    return col.text;
                }
                if (col.value && col.value !== 'null' && col.value !== '""') {
                    try {
                        const value = JSON.parse(col.value);
                        this.logger.log(`Parsed JSON value for ${columnId}: ${JSON.stringify(value)}`, 'debug');

                        if (typeof value === 'string') {
                            this.logger.log(`✅ Using string value for ${columnId}: ${value}`);
                            return value;
                        }
                        if (value && value.text) {
                            this.logger.log(`✅ Using value.text for ${columnId}: ${value.text}`);
                            return value.text;
                        }
                    } catch (e) {
                        this.logger.log(`✅ Using raw value for ${columnId}: ${col.value}`);
                        return col.value;
                    }
                }
            }
        }

        this.logger.log(`❌ Column ${columnId} not found or empty`);
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
        document.getElementById('loadingMessage').textContent = message;
        document.getElementById('loadingDetails').textContent = details;
        document.getElementById('loadingOverlay').style.display = 'flex';
        this.logger.log(`Showing loading: ${message} - ${details}`, 'debug');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
        this.logger.log('Hiding loading overlay', 'debug');
    }

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;

        setTimeout(() => notification.classList.remove('hidden'), 100);

        setTimeout(() => {
            notification.classList.add('hidden');
        }, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.diagnosticLogger.log('📄 DOM Content Loaded - Starting app initialization');
    try {
        new ClaimWebApp();
    } catch (error) {
        window.diagnosticLogger.log(`💥 App initialization crashed: ${error.message}`, 'error');
        window.diagnosticLogger.showLogger();
    }
});

window.addEventListener('load', () => {
    window.diagnosticLogger.log('🔄 Window fully loaded');
});

window.addEventListener('beforeunload', () => {
    window.diagnosticLogger.log('👋 Page unloading');
});