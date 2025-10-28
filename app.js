// ==================== 配置 ====================
const CONFIG = {
    dataFile: 'medical_data.json',
    storageKey: 'medicalRatingProgress',
    batchSize: 50,
    // Google Sheets 云存储配置
    cloudSync: {
        enabled: true,  // 设置为 true 启用云同步
        sheetId: '1fsl_V3YM5fLqeuWjXLPApsp6SmuqbBmaWQa5eOtMRwg',     // 你的 Google Sheets ID
        apiKey: 'AIzaSyBOvZ5Xf2k_iVcMC5wRSdsxb-yi1sdH8kA',      // 你的 Google API Key
        range: 'Sheet1!A:E'  // 数据范围
    }
};

// ==================== 云存储管理器 ====================
class CloudStorage {
    constructor(config) {
        this.enabled = config.enabled;
        this.sheetId = config.sheetId;
        this.apiKey = config.apiKey;
        this.range = config.range;
        this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    }

    async syncToCloud(state) {
        if (!this.enabled || !this.sheetId || !this.apiKey) {
            console.log('云同步未启用');
            return false;
        }

        try {
            const data = this.prepareData(state);
            const url = `${this.baseUrl}/${this.sheetId}/values/${this.range}:append?valueInputOption=USER_ENTERED&key=${this.apiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: data
                })
            });

            if (!response.ok) {
                throw new Error('云同步失败');
            }

            return true;
        } catch (error) {
            console.error('云同步错误:', error);
            return false;
        }
    }

    prepareData(state) {
        const rows = [];
        const userId = this.getUserId();
        const timestamp = new Date().toISOString();

        state.data.forEach((item, index) => {
            const rating = state.getRating(index);
            if (rating) {
                rows.push([
                    userId,
                    index + 1,
                    rating.score,
                    rating.timestamp,
                    item.prompt.substring(0, 100)
                ]);
            }
        });

        return rows;
    }

    getUserId() {
        let userId = localStorage.getItem('userId');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('userId', userId);
        }
        return userId;
    }
}

// ==================== 状态管理 ====================
class RatingState {
    constructor() {
        this.data = [];
        this.currentIndex = 0;
        this.currentImageIndex = 0;
        this.ratings = [];
        this.currentRating = null;
        this.startTime = null;
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(CONFIG.storageKey);
            if (!saved) return false;

            const data = JSON.parse(saved);
            this.currentIndex = data.currentIndex || 0;
            this.ratings = data.ratings || [];
            this.startTime = data.startTime || new Date().toISOString();
            
            return true;
        } catch (error) {
            console.error('加载进度失败:', error);
            return false;
        }
    }

    saveToStorage() {
        try {
            const data = {
                currentIndex: this.currentIndex,
                ratings: this.ratings,
                startTime: this.startTime,
                lastModified: new Date().toISOString()
            };
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('保存进度失败:', error);
            return false;
        }
    }

    clearStorage() {
        localStorage.removeItem(CONFIG.storageKey);
    }

    setRating(index, score) {
        this.ratings[index] = {
            score: score,
            timestamp: new Date().toISOString()
        };
    }

    getRating(index) {
        return this.ratings[index];
    }

    getCurrentPair() {
        return this.data[this.currentIndex];
    }

    getCurrentImages() {
        const pair = this.getCurrentPair();
        return pair ? pair.image_paths : [];
    }

    getTotalRated() {
        return this.ratings.filter(r => r !== null && r !== undefined).length;
    }

    isCompleted() {
        return this.currentIndex >= this.data.length;
    }
}

// ==================== 数据加载器 ====================
class DataLoader {
    static async loadData() {
        try {
            const response = await fetch(CONFIG.dataFile);
            if (!response.ok) {
                throw new Error(`HTTP错误! 状态: ${response.status}`);
            }
            const data = await response.json();
            
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('数据格式错误或为空');
            }
            
            return data;
        } catch (error) {
            console.error('加载数据失败:', error);
            throw new Error(`无法加载数据文件: ${error.message}`);
        }
    }

    static convertPath(windowsPath) {
        if (!windowsPath) return '';
        if (windowsPath.startsWith('http')) return windowsPath;
        if (windowsPath.startsWith('images/')) return windowsPath;
        
        const filename = windowsPath.split('\\').pop().split('/').pop();
        return `images/${filename}`;
    }
}

// ==================== UI管理器 ====================
class UIManager {
    constructor(state) {
        this.state = state;
        
        this.elements = {
            displayImage: document.getElementById('displayImage'),
            displayText: document.getElementById('displayText'),
            currentIndex: document.getElementById('currentIndex'),
            totalItems: document.getElementById('totalItems'),
            progressFill: document.getElementById('progressFill'),
            imageCount: document.getElementById('imageCount'),
            currentImageIndex: document.getElementById('currentImageIndex'),
            totalImages: document.getElementById('totalImages'),
            prevImageBtn: document.getElementById('prevImageBtn'),
            nextImageBtn: document.getElementById('nextImageBtn'),
            thumbnailContainer: document.getElementById('thumbnailContainer'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            saveProgressBtn: document.getElementById('saveProgressBtn'),
            mainContent: document.getElementById('mainContent'),
            ratingButtons: document.querySelectorAll('.rating-btn'),
            caseProgressContainer: document.getElementById('caseProgressContainer'),
            downloadCsvBtn: document.getElementById('downloadCsvBtn'),
            syncBtn: document.getElementById('syncBtn')
        };

        if (this.elements.nextBtn && this.elements.prevBtn) {
            this.bindEvents();
        }
    }

    bindEvents() {
        // 评分按钮
        this.elements.ratingButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectRating(parseInt(btn.dataset.score));
            });
        });

        // 导航按钮
        this.elements.nextBtn.addEventListener('click', () => this.nextPair());
        this.elements.prevBtn.addEventListener('click', () => this.prevPair());
        this.elements.saveProgressBtn.addEventListener('click', () => this.saveProgress());

        // 图片导航按钮
        this.elements.prevImageBtn.addEventListener('click', () => this.prevImage());
        this.elements.nextImageBtn.addEventListener('click', () => this.nextImage());

        // CSV下载按钮
        if (this.elements.downloadCsvBtn) {
            this.elements.downloadCsvBtn.addEventListener('click', () => {
                window.app.downloadCSV();
            });
        }

        // 云同步按钮
        if (this.elements.syncBtn && CONFIG.cloudSync.enabled) {
            this.elements.syncBtn.style.display = 'inline-block';
            this.elements.syncBtn.addEventListener('click', () => {
                window.app.syncToCloud();
            });
        }

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= '4') {
                this.selectRating(parseInt(e.key));
            } else if (e.key === 'ArrowRight') {
                if (!this.elements.nextBtn.disabled) {
                    this.nextPair();
                }
            } else if (e.key === 'ArrowLeft') {
                if (!this.elements.prevBtn.disabled) {
                    this.prevPair();
                }
            } else if (e.key === 's' || e.key === 'S') {
                this.saveProgress();
            }
        });
    }

    init() {
        if (this.state.isCompleted()) {
            this.showCompletion();
        } else {
            this.renderProgressBalls();
            this.render();
        }
    }

    renderProgressBalls() {
        if (!this.elements.caseProgressContainer) return;

        const totalCases = this.state.data.length;
        this.elements.caseProgressContainer.innerHTML = '';

        // 显示所有进度球，不分页
        for (let i = 0; i < totalCases; i++) {
            const ball = document.createElement('div');
            ball.className = 'case-progress-item';
            ball.textContent = i + 1;
            ball.title = `病例 ${i + 1}`;

            // 已评分的标记
            if (this.state.getRating(i)) {
                ball.classList.add('rated');
            }

            // 当前病例标记
            if (i === this.state.currentIndex) {
                ball.classList.add('active');
                // 滚动到当前病例
                setTimeout(() => {
                    ball.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }, 100);
            }

            // 点击跳转
            ball.addEventListener('click', () => {
                this.jumpToCase(i);
            });

            this.elements.caseProgressContainer.appendChild(ball);
        }
    }

    jumpToCase(targetIndex) {
        if (targetIndex < 0 || targetIndex >= this.state.data.length) return;

        this.state.currentIndex = targetIndex;
        this.state.currentImageIndex = 0;
        this.render();
    }

    render() {
        const pair = this.state.getCurrentPair();
        if (!pair) {
            this.showCompletion();
            return;
        }

        // 显示图片
        this.displayImages(pair.image_paths);

        // 显示文本
        if (this.elements.displayText) {
            this.elements.displayText.textContent = pair.prompt;
        }

        // 更新计数器
        if (this.elements.currentIndex) {
            this.elements.currentIndex.textContent = this.state.currentIndex + 1;
        }
        if (this.elements.totalItems) {
            this.elements.totalItems.textContent = this.state.data.length;
        }

        // 更新进度条
        this.updateProgress();

        // 更新进度球
        this.renderProgressBalls();

        // 恢复评分
        const savedRating = this.state.getRating(this.state.currentIndex);
        if (savedRating) {
            this.selectRating(savedRating.score, false);
        } else {
            this.clearRatingSelection();
        }

        // 更新按钮状态
        this.elements.prevBtn.disabled = this.state.currentIndex === 0;
    }

    displayImages(imagePaths) {
        if (!imagePaths || imagePaths.length === 0) return;

        const currentImagePath = imagePaths[this.state.currentImageIndex];
        
        // 显示主图片
        if (this.elements.displayImage) {
            this.elements.displayImage.src = DataLoader.convertPath(currentImagePath);
        }

        // 更新图片计数
        if (this.elements.imageCount) {
            this.elements.imageCount.textContent = `(${imagePaths.length}张)`;
        }

        if (this.elements.currentImageIndex) {
            this.elements.currentImageIndex.textContent = this.state.currentImageIndex + 1;
        }
        if (this.elements.totalImages) {
            this.elements.totalImages.textContent = imagePaths.length;
        }

        // 更新导航按钮
        if (this.elements.prevImageBtn) {
            this.elements.prevImageBtn.disabled = this.state.currentImageIndex === 0;
        }
        if (this.elements.nextImageBtn) {
            this.elements.nextImageBtn.disabled = this.state.currentImageIndex === imagePaths.length - 1;
        }

        // 显示或隐藏导航区域
        const showNav = imagePaths.length > 1;
        if (this.elements.imageNavigation) {
            this.elements.imageNavigation.style.display = showNav ? 'flex' : 'none';
        }

        // 显示缩略图
        this.displayThumbnails(imagePaths);
    }

    displayThumbnails(imagePaths) {
        this.elements.thumbnailContainer.innerHTML = '';
        
        if (imagePaths.length <= 1) return;

        imagePaths.forEach((path, index) => {
            const thumbnail = document.createElement('div');
            thumbnail.className = 'thumbnail';
            if (index === this.state.currentImageIndex) {
                thumbnail.classList.add('active');
            }

            const img = document.createElement('img');
            img.src = DataLoader.convertPath(path);
            img.alt = `缩略图 ${index + 1}`;
            
            thumbnail.appendChild(img);
            thumbnail.addEventListener('click', () => {
                this.state.currentImageIndex = index;
                this.displayImages(imagePaths);
            });

            this.elements.thumbnailContainer.appendChild(thumbnail);
        });
    }

    prevImage() {
        const images = this.state.getCurrentImages();
        if (this.state.currentImageIndex > 0) {
            this.state.currentImageIndex--;
            this.displayImages(images);
        }
    }

    nextImage() {
        const images = this.state.getCurrentImages();
        if (this.state.currentImageIndex < images.length - 1) {
            this.state.currentImageIndex++;
            this.displayImages(images);
        }
    }

    selectRating(score, saveRating = true) {
        this.clearRatingSelection();
        
        const selectedBtn = Array.from(this.elements.ratingButtons)
            .find(btn => parseInt(btn.dataset.score) === score);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
        }
        
        this.state.currentRating = score;
        
        if (saveRating) {
            this.state.setRating(this.state.currentIndex, score);
            this.state.saveToStorage();
            // 更新进度球显示
            this.renderProgressBalls();
        }
        
        this.elements.nextBtn.disabled = false;
    }

    clearRatingSelection() {
        this.elements.ratingButtons.forEach(btn => {
            btn.classList.remove('selected');
        });
        this.state.currentRating = null;
        this.elements.nextBtn.disabled = true;
    }

    nextPair() {
        if (this.state.currentRating === null) return;
        
        this.state.currentIndex++;
        this.state.currentImageIndex = 0;
        
        if (this.state.isCompleted()) {
            this.showCompletion();
        } else {
            this.render();
        }
    }

    prevPair() {
        if (this.state.currentIndex > 0) {
            this.state.currentIndex--;
            this.state.currentImageIndex = 0;
            this.render();
        }
    }

    updateProgress() {
        const progress = (this.state.currentIndex / this.state.data.length) * 100;
        this.elements.progressFill.style.width = `${progress}%`;
    }

    saveProgress() {
        if (this.state.saveToStorage()) {
            this.showNotification('进度已保存！', 'success');
        } else {
            this.showNotification('保存失败，请重试', 'error');
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.background = type === 'success' ? '#28a745' : '#dc3545';
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    showCompletion() {
        this.elements.mainContent.innerHTML = `
            <div class="completion-message">
                <h2>🎉 恭喜完成！</h2>
                <p>您已完成所有 ${this.state.data.length} 个病例的评分</p>
                <p>评分数量: ${this.state.getTotalRated()} / ${this.state.data.length}</p>
                <div class="action-buttons">
                    <button class="btn btn-success" onclick="app.downloadCSV()">下载CSV结果</button>
                    <button class="btn btn-info" onclick="app.downloadJSON()">下载JSON结果</button>
                    ${CONFIG.cloudSync.enabled ? '<button class="btn btn-primary" onclick="app.syncToCloud()">同步到云端</button>' : ''}
                    <button class="btn btn-secondary" onclick="app.restart()">重新开始</button>
                </div>
            </div>
        `;
    }
}

// ==================== 导出管理器 ====================
class ExportManager {
    static generateCSV(state) {
        const headers = ['序号', '评分', '评分时间', 'Prompt'];
        const rows = [headers];

        state.data.forEach((item, index) => {
            const rating = state.getRating(index);
            rows.push([
                index + 1,
                rating ? rating.score : '',
                rating ? rating.timestamp : '',
                item.prompt.replace(/"/g, '""')
            ]);
        });

        return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    static generateJSON(state) {
        const results = state.data.map((item, index) => {
            const rating = state.getRating(index);
            return {
                index: index + 1,
                score: rating ? rating.score : null,
                timestamp: rating ? rating.timestamp : null,
                prompt: item.prompt,
                image_count: item.image_paths.length
            };
        });

        return JSON.stringify({
            metadata: {
                total_cases: state.data.length,
                completed: state.getTotalRated(),
                start_time: state.startTime,
                export_time: new Date().toISOString()
            },
            results: results
        }, null, 2);
    }

    static download(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// ==================== 主应用 ====================
class RatingApp {
    constructor() {
        this.state = new RatingState();
        this.ui = null;
        this.cloudStorage = new CloudStorage(CONFIG.cloudSync);
    }

    async init() {
        const mainContent = document.getElementById('mainContent');
        const originalHTML = mainContent ? mainContent.innerHTML : '';
        
        try {
            if (mainContent) {
                mainContent.innerHTML = `
                    <div class="loading-message">
                        <h2>正在加载医学数据...</h2>
                        <p>请稍候</p>
                    </div>
                `;
            }

            this.state.data = await DataLoader.loadData();

            if (mainContent && originalHTML) {
                mainContent.innerHTML = originalHTML;
            }

            const hasProgress = this.state.loadFromStorage();
            
            if (hasProgress) {
                const resume = confirm(
                    `检测到之前的进度（已完成 ${this.state.getTotalRated()} / ${this.state.data.length} 项）\n\n` +
                    `是否继续之前的进度？\n\n` +
                    `点击"确定"继续，点击"取消"重新开始`
                );
                
                if (!resume) {
                    this.state.currentIndex = 0;
                    this.state.ratings = [];
                    this.state.startTime = new Date().toISOString();
                }
            }

            this.ui = new UIManager(this.state);
            this.ui.init();

        } catch (error) {
            console.error('初始化失败:', error);
            if (mainContent) {
                mainContent.innerHTML = `
                    <div class="error-message">
                        <h2>❌ 加载失败</h2>
                        <p>${error.message}</p>
                        <p>请确保 medical_data.json 文件存在且格式正确</p>
                        <button class="btn btn-primary" onclick="location.reload()">重新加载</button>
                    </div>
                `;
            }
        }
    }

    downloadCSV() {
        const csv = ExportManager.generateCSV(this.state);
        const filename = `medical_rating_results_${Date.now()}.csv`;
        ExportManager.download(csv, filename, 'text/csv;charset=utf-8;');
        this.ui.showNotification('CSV文件已下载！', 'success');
    }

    downloadJSON() {
        const json = ExportManager.generateJSON(this.state);
        const filename = `medical_rating_results_${Date.now()}.json`;
        ExportManager.download(json, filename, 'application/json');
        this.ui.showNotification('JSON文件已下载！', 'success');
    }

    async syncToCloud() {
        this.ui.showNotification('正在同步到云端...', 'success');
        const success = await this.cloudStorage.syncToCloud(this.state);
        if (success) {
            this.ui.showNotification('云同步成功！', 'success');
        } else {
            this.ui.showNotification('云同步失败，请检查配置', 'error');
        }
    }

    restart() {
        if (confirm('确定要重新开始吗？当前进度将被清除。')) {
            this.state.clearStorage();
            location.reload();
        }
    }
}

// ==================== 应用启动 ====================
let app;

window.addEventListener('load', () => {
    app = new RatingApp();
    app.init();
});