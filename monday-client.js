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
        this.logger?.log(`Query: ${query.substring(0, 100)}...`, 'debug');

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

    async queryAllItemsInGroup(boardId, groupId, limit = 100) {
        this.logger?.log(`Querying all items in group: ${groupId}`);
        let allItems = [];
        let cursor = null;
        let page = 1;

        while (true) {
            const query = cursor ? `
                query GetItems($boardId: ID!, $groupId: String!, $limit: Int!, $cursor: String!) {
                    boards(ids: [$boardId]) {
                        groups(ids: [$groupId]) {
                            items_page(limit: $limit, cursor: $cursor) {
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
                query GetItems($boardId: ID!, $groupId: String!, $limit: Int!) {
                    boards(ids: [$boardId]) {
                        groups(ids: [$groupId]) {
                            items_page(limit: $limit) {
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
                { boardId, groupId: String(groupId), limit, cursor } :
                { boardId, groupId: String(groupId), limit };

            try {
                const data = await this.makeRequest(query, variables);

                if (!data.boards || data.boards.length === 0) {
                    this.logger?.log('No boards found in response');
                    break;
                }

                const board = data.boards[0];
                if (!board.groups || board.groups.length === 0) {
                    this.logger?.log('No groups found in board');
                    break;
                }

                const group = board.groups[0];
                if (!group.items_page) {
                    this.logger?.log('No items_page found in group');
                    break;
                }

                const itemsPage = group.items_page;
                const pageItems = itemsPage.items || [];
                allItems = allItems.concat(pageItems);

                this.logger?.log(`Page ${page}: Got ${pageItems.length} items`);

                if (!itemsPage.cursor || pageItems.length < limit) {
                    this.logger?.log('No more pages or reached limit');
                    break;
                }

                cursor = itemsPage.cursor;
                page++;

                // Safety limit
                if (page > 10) {
                    this.logger?.log('Reached safety limit of 10 pages', 'warn');
                    break;
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                this.logger?.log(`Error in paginated query: ${error.message}`, 'error');
                throw error;
            }
        }

        this.logger?.log(`✅ Total items collected: ${allItems.length}`);
        return allItems;
    }

    async getItemsSimple(boardId, groupId, limit = 100) {
        this.logger?.log(`Getting items with simple query: ${groupId}`);
        const query = `
            query GetItemsSimple($boardId: ID!, $groupId: String!) {
                boards(ids: [$boardId]) {
                    groups(ids: [$groupId]) {
                        items(limit: ${limit}) {
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
        `;

        const variables = {
            boardId,
            groupId: String(groupId)
        };

        try {
            const data = await this.makeRequest(query, variables);

            if (data.boards && data.boards.length > 0 &&
                data.boards[0].groups && data.boards[0].groups.length > 0) {
                const items = data.boards[0].groups[0].items || [];
                this.logger?.log(`✅ Simple query returned ${items.length} items`);
                return items;
            }

            this.logger?.log('Simple query returned no items');
            return [];
        } catch (error) {
            this.logger?.log(`❌ Simple query failed: ${error.message}`, 'error');
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

    async getItemsBasic(boardId, groupId) {
        this.logger?.log(`Getting items with basic query: ${groupId}`);
        const query = `
            {
                boards(ids: ["${boardId}"]) {
                    groups(ids: ["${groupId}"]) {
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
        `;

        try {
            const data = await this.makeRequest(query);

            if (data.boards && data.boards.length > 0 &&
                data.boards[0].groups && data.boards[0].groups.length > 0) {
                const items = data.boards[0].groups[0].items || [];
                this.logger?.log(`✅ Basic query returned ${items.length} items`);
                return items;
            }

            this.logger?.log('Basic query returned no items');
            return [];
        } catch (error) {
            this.logger?.log(`❌ Basic query failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Test connection method
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