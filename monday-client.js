class MondayClient {
    constructor() {
        this.apiKey = null;
        this.baseUrl = 'https://api.monday.com/v2';
        this.logger = typeof window.diagnosticLogger !== 'undefined' ? window.diagnosticLogger : {
            log: (msg, type = 'info') => console[type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log'](msg)
        };
    }

    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.logger?.log('API key set');
    }

    async makeRequest(query, variables = {}) {
        if (!this.apiKey) {
            this.logger?.log('API key not set', 'error');
            throw new Error('API key not set');
        }

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': this.apiKey,
                    'Content-Type': 'application/json',
                    'API-Version': '2023-10'
                },
                body: JSON.stringify({
                    query,
                    variables
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
            }

            const result = await response.json();

            if (result.errors && result.errors.length > 0) {
                const errorMessages = result.errors.map(error => error.message).join(', ');
                throw new Error(`Monday.com API error: ${errorMessages}`);
            }

            return result.data;
        } catch (error) {
            this.logger?.log(`Monday.com API request failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async getCurrentUser() {
        this.logger?.log('Getting current user...');
        const query = `
            {
                me {
                    id
                    name
                    email
                }
            }
        `;

        try {
            const data = await this.makeRequest(query);
            this.logger?.log(`✅ User loaded: ${data.me.name} (${data.me.email})`);
            return data.me;
        } catch (error) {
            this.logger?.log(`❌ Failed to get user: ${error.message}`, 'error');
            throw error;
        }
    }

    async getBoardWithGroups(boardId) {
        this.logger?.log(`Getting board with groups: ${boardId}`);
        const query = `
            query GetBoard($boardId: ID!) {
                boards(ids: [$boardId]) {
                    id
                    name
                    groups {
                        id
                        title
                    }
                }
            }
        `;

        try {
            const data = await this.makeRequest(query, { boardId });
            if (data.boards && data.boards.length > 0) {
                const board = data.boards[0];
                this.logger?.log(`✅ Board loaded: ${board.name} with ${board.groups?.length || 0} groups`);
                return board;
            } else {
                this.logger?.log('❌ No board found', 'error');
                throw new Error('No board found');
            }
        } catch (error) {
            this.logger?.log(`❌ Failed to get board: ${error.message}`, 'error');
            throw error;
        }
    }

    async queryItemsPaginated(boardId, groupId, onProgress = null) {
        this.logger?.log(`Querying items with pagination: ${groupId}`);

        // Use maximum page size of 500 for maximum performance
        const pageSize = 500;
        const maxPages = 20; // 500 * 20 = 10,000 items max (should be plenty)

        let allItems = [];
        let cursor = null;
        let page = 1;

        while (true) {
            const query = cursor ? `
                query GetItemsPage($boardId: ID!, $groupId: String!, $cursor: String!) {
                    boards(ids: [$boardId]) {
                        groups(ids: [$groupId]) {
                            items_page(limit: ${pageSize}, cursor: $cursor) {
                                cursor
                                items {
                                    id
                                    name
                                    column_values {
                                        id
                                        value
                                        text
                                    }
                                }
                            }
                        }
                    }
                }
            ` : `
                query GetItemsPage($boardId: ID!, $groupId: String!) {
                    boards(ids: [$boardId]) {
                        groups(ids: [$groupId]) {
                            items_page(limit: ${pageSize}) {
                                cursor
                                items {
                                    id
                                    name
                                    column_values {
                                        id
                                        value
                                        text
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const variables = cursor ?
                { boardId, groupId: String(groupId), cursor } :
                { boardId, groupId: String(groupId) };

            try {
                const data = await this.makeRequest(query, variables);

                if (!data.boards || data.boards.length === 0 ||
                    !data.boards[0].groups || data.boards[0].groups.length === 0 ||
                    !data.boards[0].groups[0].items_page) {
                    break;
                }

                const itemsPage = data.boards[0].groups[0].items_page;
                const pageItems = itemsPage.items || [];
                allItems = allItems.concat(pageItems);

                this.logger?.log(`Page ${page}: ${pageItems.length} items (Total: ${allItems.length})`);

                // Call progress callback immediately
                if (onProgress && typeof onProgress === 'function') {
                    try {
                        // Use microtask for immediate UI update
                        Promise.resolve().then(() => {
                            onProgress(allItems.length, pageItems.length, page);
                        });
                    } catch (progressError) {
                        this.logger?.log(`Progress callback error: ${progressError.message}`, 'warn');
                    }
                }

                // Check if we should continue
                if (!itemsPage.cursor || pageItems.length < pageSize) {
                    break;
                }

                cursor = itemsPage.cursor;
                page++;

                if (page > maxPages) {
                    this.logger?.log(`Reached safety limit of ${maxPages} pages (${maxPages * pageSize} items)`, 'warn');
                    break;
                }

                // Minimal delay of 1ms between requests for maximum speed
                if (page > 1) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            } catch (error) {
                this.logger?.log(`Error in paginated query page ${page}: ${error.message}`, 'error');
                throw error;
            }
        }

        this.logger?.log(`✅ Paginated query completed: ${allItems.length} total items`);
        return allItems;
    }

    // Alternative method: Try to get all items in one request if possible
    async queryAllItemsDirect(boardId, groupId, onProgress = null) {
        this.logger?.log(`Attempting direct query for all items in group: ${groupId}`);

        try {
            const query = `
                query GetAllItems($boardId: ID!, $groupId: String!) {
                    boards(ids: [$boardId]) {
                        groups(ids: [$groupId]) {
                            items_page(limit: 500) {
                                items {
                                    id
                                    name
                                    column_values {
                                        id
                                        value
                                        text
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const variables = { boardId, groupId: String(groupId) };
            const data = await this.makeRequest(query, variables);

            if (data.boards && data.boards.length > 0 &&
                data.boards[0].groups && data.boards[0].groups.length > 0 &&
                data.boards[0].groups[0].items_page) {

                const items = data.boards[0].groups[0].items_page.items || [];
                this.logger?.log(`✅ Direct query successful: ${items.length} items`);

                if (onProgress && typeof onProgress === 'function') {
                    Promise.resolve().then(() => {
                        onProgress(items.length, items.length, 1);
                    });
                }

                return items;
            }

            return [];
        } catch (error) {
            this.logger?.log(`Direct query failed: ${error.message}`, 'warn');
            throw error;
        }
    }

    async createItem(boardId, groupId, itemName, columnValues) {
        this.logger?.log(`Creating item: ${itemName}`);
        const query = `
            mutation CreateItem($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
                create_item(
                    board_id: $boardId,
                    group_id: $groupId,
                    item_name: $itemName,
                    column_values: $columnValues
                ) {
                    id
                }
            }
        `;

        const variables = {
            boardId,
            groupId: String(groupId),
            itemName,
            columnValues
        };

        try {
            const data = await this.makeRequest(query, variables);
            this.logger?.log(`✅ Item created successfully: ${data.create_item?.id}`);
            return data.create_item;
        } catch (error) {
            this.logger?.log(`❌ Failed to create item: ${error.message}`, 'error');
            throw error;
        }
    }

    async updateItem(itemId, columnValues, boardId = '6500270039') {
        this.logger?.log(`Updating item: ${itemId}`);
        const query = `
            mutation UpdateItem($itemId: ID!, $boardId: ID!, $columnValues: JSON!) {
                change_multiple_column_values(
                    item_id: $itemId,
                    board_id: $boardId,
                    column_values: $columnValues
                ) {
                    id
                }
            }
        `;

        const variables = {
            itemId,
            boardId,
            columnValues
        };

        try {
            const data = await this.makeRequest(query, variables);
            this.logger?.log(`✅ Item updated successfully: ${itemId}`);
            return data.change_multiple_column_values;
        } catch (error) {
            this.logger?.log(`❌ Failed to update item: ${error.message}`, 'error');
            throw error;
        }
    }

    async deleteItem(itemId) {
        this.logger?.log(`Deleting item: ${itemId}`);
        const query = `
            mutation DeleteItem($itemId: ID!) {
                delete_item(item_id: $itemId) {
                    id
                }
            }
        `;

        const variables = {
            itemId
        };

        try {
            const data = await this.makeRequest(query, variables);
            this.logger?.log(`✅ Item deleted successfully: ${itemId}`);
            return data.delete_item;
        } catch (error) {
            this.logger?.log(`❌ Failed to delete item: ${error.message}`, 'error');
            throw error;
        }
    }

    async testConnection() {
        this.logger?.log('Testing Monday.com connection...');
        try {
            const user = await this.getCurrentUser();
            this.logger?.log('✅ Connection test successful');
            return { success: true, user };
        } catch (error) {
            this.logger?.log(`❌ Connection test failed: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
}