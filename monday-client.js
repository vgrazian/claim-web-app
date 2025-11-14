class MondayClient {
    constructor() {
        this.apiKey = null;
        this.baseUrl = 'https://api.monday.com/v2';
        this.logger = window.diagnosticLogger;
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

        this.logger?.log('Making Monday.com API request...', 'debug');

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
                this.logger?.log(`HTTP error! status: ${response.status}`, 'error');
                throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
            }

            const result = await response.json();

            if (result.errors && result.errors.length > 0) {
                const errorMessages = result.errors.map(error => error.message).join(', ');
                this.logger?.log(`Monday.com API error: ${errorMessages}`, 'error');
                throw new Error(`Monday.com API error: ${errorMessages}`);
            }

            this.logger?.log('API request successful', 'debug');
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

    async queryAllItemsInGroup(boardId, groupId, limit = 5000) {
        this.logger?.log(`Querying all items in group: ${groupId} (limit: ${limit})`);

        const query = `
            query GetItems($boardId: ID!, $groupId: String!) {
                boards(ids: [$boardId]) {
                    groups(ids: [$groupId]) {
                        id
                        title
                        items_page(limit: ${limit}) {
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

        const variables = {
            boardId,
            groupId: String(groupId)
        };

        try {
            const data = await this.makeRequest(query, variables);

            if (data.boards && data.boards.length > 0 &&
                data.boards[0].groups && data.boards[0].groups.length > 0 &&
                data.boards[0].groups[0].items_page) {
                const items = data.boards[0].groups[0].items_page.items || [];
                this.logger?.log(`✅ Query returned ${items.length} items`);

                if (items.length > 0) {
                    this.logger?.log('📋 SAMPLE ITEMS FROM QUERY:');
                    items.slice(0, 3).forEach((item, index) => {
                        this.logger?.log(`   Item ${index + 1}: "${item.name}"`, 'debug');
                        this.logger?.log(`     ID: ${item.id}`, 'debug');
                        if (item.column_values) {
                            const importantColumns = item.column_values.filter(col =>
                                col.id === 'date4' || col.id === 'person' ||
                                col.id === 'status' || col.id === 'text__1' ||
                                col.id === 'text8__1' || col.id === 'numbers__1'
                            );
                            if (importantColumns.length > 0) {
                                this.logger?.log(`     IMPORTANT COLUMNS:`, 'debug');
                                importantColumns.forEach(col => {
                                    this.logger?.log(`       ${col.id}: value="${col.value}", text="${col.text}"`, 'debug');
                                });
                            }
                        }
                    });
                }

                return items;
            }

            this.logger?.log('Query returned no items');
            return [];
        } catch (error) {
            this.logger?.log(`❌ Query failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async queryItemsPaginated(boardId, groupId, limit = 5000) {
        this.logger?.log(`Querying items with pagination: ${groupId}`);

        let allItems = [];
        let cursor = null;
        let page = 1;
        const pageSize = 100;

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

                if (!itemsPage.cursor || pageItems.length < pageSize || allItems.length >= limit) {
                    break;
                }

                cursor = itemsPage.cursor;
                page++;

                if (page > 50) {
                    this.logger?.log('Reached safety limit of 50 pages', 'warn');
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                this.logger?.log(`Error in paginated query page ${page}: ${error.message}`, 'error');
                throw error;
            }
        }

        this.logger?.log(`✅ Paginated query completed: ${allItems.length} total items`);
        return allItems;
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

    async updateItem(itemId, columnValues) {
        this.logger?.log(`Updating item: ${itemId}`);
        const query = `
            mutation UpdateItem($itemId: ID!, $columnValues: JSON!) {
                change_multiple_column_values(
                    item_id: $itemId,
                    column_values: $columnValues
                ) {
                    id
                }
            }
        `;

        const variables = {
            itemId,
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