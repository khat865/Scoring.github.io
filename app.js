// 全局状态管理
const state = {
    currentIndex: 0,
    cases: [],
    userId: generateUserId(),
    sessionId: generateSessionId(),
    ratings: {
        task1: {}, // 图文相似度评分
        task2: {}, // 诊断相似度评分
        task3: {}  // 诊断排序选择
    },
    currentImageIndex: 0,
    googleSheetsUrl: 'https://script.google.com/macros/s/AKfycbxzuzjBZjQWS3IY886QC_3F2n4ED5V0S-01nr4DV3JmbMx0dywaEcQzZb9J64FGHudt/exec' // 在这里填入你的Google Apps Script Web App URL
};

// 生成唯一用户ID
function generateUserId() {
    let userId = localStorage.getItem('userId');
    if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userId', userId);
    }
    return userId;
}

// 生成会话ID
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 初始化
async function init() {
    try {
        // 加载配置
        loadConfig();
        
        // 加载数据
        const response = await fetch('data.json');
        state.cases = await response.json();
        
        // 初始化界面
        updateProgress();
        setupEventListeners();
        loadCase(0);
        
        // 恢复已有评分
        loadSavedRatings();
    } catch (error) {
        console.error('初始化失败:', error);
        showNotification('数据加载失败', 'error');
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 任务1评分按钮
    document.querySelectorAll('#ratingButtons1 .rating-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const score = parseInt(e.currentTarget.dataset.score);
            setRating('task1', score);
        });
    });

    // 任务2评分按钮
    document.querySelectorAll('#ratingButtons2 .rating-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const score = parseInt(e.currentTarget.dataset.score);
            setRating('task2', score);
        });
    });

    // 任务3选择按钮
    document.querySelectorAll('.choice-select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const choice = e.currentTarget.dataset.choice;
            setRating('task3', choice);
        });
    });

    // 排序选项整体点击
    document.querySelectorAll('.ranking-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const choice = option.dataset.choice;
            setRating('task3', choice);
        });
    });

    // 导航按钮
    document.getElementById('prevBtn').addEventListener('click', () => navigateCase(-1));
    document.getElementById('nextBtn').addEventListener('click', () => navigateCase(1));

    // CSV下载
    document.getElementById('downloadCsvBtn').addEventListener('click', downloadCSV);
    
    // 配置按钮
    document.getElementById('configBtn').addEventListener('click', showConfigModal);
    document.querySelector('.modal-close').addEventListener('click', hideConfigModal);
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
    document.getElementById('submitAllBtn').addEventListener('click', submitAllCompletedRatings);

    // 图片导航
    document.getElementById('prevImageBtn')?.addEventListener('click', () => navigateImage(-1));
    document.getElementById('nextImageBtn')?.addEventListener('click', () => navigateImage(1));
}

// 加载病例
function loadCase(index) {
    if (index < 0 || index >= state.cases.length) return;
    
    state.currentIndex = index;
    state.currentImageIndex = 0;
    
    const caseData = state.cases[index];
    
    // 加载任务1: 图文相似度
    loadTask1(caseData);
    
    // 加载任务2: 诊断相似度
    loadTask2(caseData);
    
    // 加载任务3: 诊断排序
    loadTask3(caseData, index);
    
    // 更新进度
    updateProgress();
    updateNavigationButtons();
    
    // 恢复当前病例的评分
    restoreRatings();
}

// 加载任务1
function loadTask1(caseData) {
    const textElement = document.getElementById('displayText');
    textElement.textContent = caseData.prompt || caseData.description || '暂无描述';
    
    loadImagesForTask1();
}

// 加载任务1的图片
function loadImagesForTask1() {
    const caseData = state.cases[state.currentIndex];
    const images = caseData.image_paths || [];
    
    if (images.length === 0) {
        document.getElementById('displayImage').src = '';
        document.getElementById('displayImage').alt = '无图片';
        return;
    }
    
    // 更新图片计数
    document.getElementById('imageCount').textContent = `(${images.length}张)`;
    document.getElementById('totalImages').textContent = images.length;
    
    // 加载主图片
    updateMainImage(images[state.currentImageIndex]);
    
    // 加载缩略图
    loadThumbnails(images);
    
    // 更新导航按钮
    updateImageNavigation(images.length);
}

// 更新主图片
function updateMainImage(imagePath) {
    const imgElement = document.getElementById('displayImage');
    imgElement.src = imagePath;
    document.getElementById('currentImageIndex').textContent = state.currentImageIndex + 1;
}

// 加载缩略图
function loadThumbnails(images) {
    const container = document.getElementById('thumbnailContainer');
    container.innerHTML = '';
    
    images.forEach((path, index) => {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'thumbnail';
        if (index === state.currentImageIndex) {
            thumbnail.classList.add('active');
        }
        
        const img = document.createElement('img');
        img.src = path;
        img.alt = `缩略图 ${index + 1}`;
        
        thumbnail.appendChild(img);
        thumbnail.addEventListener('click', () => {
            state.currentImageIndex = index;
            loadImagesForTask1();
        });
        
        container.appendChild(thumbnail);
    });
}

// 图片导航
function navigateImage(direction) {
    const images = state.cases[state.currentIndex].image_paths || [];
    const newIndex = state.currentImageIndex + direction;
    
    if (newIndex >= 0 && newIndex < images.length) {
        state.currentImageIndex = newIndex;
        loadImagesForTask1();
    }
}

// 更新图片导航按钮
function updateImageNavigation(totalImages) {
    const prevBtn = document.getElementById('prevImageBtn');
    const nextBtn = document.getElementById('nextImageBtn');
    
    prevBtn.disabled = state.currentImageIndex === 0;
    nextBtn.disabled = state.currentImageIndex === totalImages - 1;
}

// 加载任务2
function loadTask2(caseData) {
    document.getElementById('predictedDiagnosis').textContent = 
        caseData.predicted_diagnosis || '暂无预测诊断';
    document.getElementById('groundTruthDiagnosis').textContent = 
        caseData.ground_truth_diagnosis || '暂无真实诊断';
}

// 加载任务3
function loadTask3(caseData, currentIndex) {
    // 选项A: 当前病例
    document.getElementById('pairA_predicted').textContent = 
        caseData.predicted_diagnosis || '暂无预测诊断';
    document.getElementById('pairA_groundTruth').textContent = 
        caseData.ground_truth_diagnosis || '暂无真实诊断';
    
    // 选项B: 下一个病例（如果存在）
    const nextCase = state.cases[currentIndex + 1] || state.cases[0];
    document.getElementById('pairB_predicted').textContent = 
        nextCase.predicted_diagnosis || '暂无预测诊断';
    document.getElementById('pairB_groundTruth').textContent = 
        nextCase.ground_truth_diagnosis || '暂无真实诊断';
}

// 设置评分
function setRating(taskId, value) {
    const caseId = state.cases[state.currentIndex].pmid || state.cases[state.currentIndex].id;
    
    // 保存评分
    state.ratings[taskId][caseId] = {
        value: value,
        timestamp: new Date().toISOString()
    };
    
    // 更新UI
    updateRatingButtons(taskId, value);
    
    // 保存到localStorage
    saveRatings();
    
    // 检查是否可以进入下一个病例
    updateNavigationButtons();
    
    // 显示通知
    const taskNames = {
        'task1': '任务1',
        'task2': '任务2',
        'task3': '任务3'
    };
    showNotification(`${taskNames[taskId]}已评分: ${value}`, 'success');
}

// 更新评分按钮状态
function updateRatingButtons(taskId, value) {
    if (taskId === 'task3') {
        // 排序任务
        document.querySelectorAll('.ranking-option').forEach(option => {
            option.classList.toggle('selected', option.dataset.choice === value);
        });
    } else {
        // 评分任务
        const buttonId = taskId === 'task1' ? 'ratingButtons1' : 'ratingButtons2';
        const buttonsContainer = document.getElementById(buttonId);
        buttonsContainer.querySelectorAll('.rating-btn').forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.score) === value);
        });
    }
}

// 恢复评分
function restoreRatings() {
    const caseId = state.cases[state.currentIndex].pmid || state.cases[state.currentIndex].id;
    
    ['task1', 'task2', 'task3'].forEach(taskId => {
        const rating = state.ratings[taskId][caseId];
        if (rating) {
            updateRatingButtons(taskId, rating.value);
        } else {
            clearRatingButtons(taskId);
        }
    });
}

// 清除评分按钮
function clearRatingButtons(taskId) {
    if (taskId === 'task3') {
        document.querySelectorAll('.ranking-option').forEach(option => {
            option.classList.remove('selected');
        });
    } else {
        const buttonId = taskId === 'task1' ? 'ratingButtons1' : 'ratingButtons2';
        const buttonsContainer = document.getElementById(buttonId);
        buttonsContainer.querySelectorAll('.rating-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
    }
}

// 检查当前病例是否全部完成
function isCurrentCaseCompleted() {
    const caseId = state.cases[state.currentIndex].pmid || state.cases[state.currentIndex].id;
    return ['task1', 'task2', 'task3'].every(taskId => 
        state.ratings[taskId][caseId] !== undefined
    );
}

// 更新导航按钮
function updateNavigationButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    prevBtn.disabled = state.currentIndex === 0;
    nextBtn.disabled = !isCurrentCaseCompleted() || state.currentIndex === state.cases.length - 1;
}

// 导航病例
async function navigateCase(direction) {
    const newIndex = state.currentIndex + direction;
    
    if (newIndex >= 0 && newIndex < state.cases.length) {
        // 检查当前病例是否完成
        if (direction > 0 && !isCurrentCaseCompleted()) {
            showNotification('请完成所有三项任务后再进入下一病例', 'warning');
            return;
        }
        
        // 如果是前进到下一病例，提交当前病例数据到Google表格
        if (direction > 0 && isCurrentCaseCompleted()) {
            await submitToGoogleSheets();
        }
        
        loadCase(newIndex);
        window.scrollTo(0, 0);
    }
}

// 更新进度
function updateProgress() {
    document.getElementById('currentIndex').textContent = state.currentIndex + 1;
    document.getElementById('totalItems').textContent = state.cases.length;
    
    const progress = ((state.currentIndex + 1) / state.cases.length) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
}

// 保存评分到localStorage
function saveRatings() {
    localStorage.setItem('ratings_' + state.userId, JSON.stringify(state.ratings));
}

// 加载已保存的评分
function loadSavedRatings() {
    const saved = localStorage.getItem('ratings_' + state.userId);
    if (saved) {
        state.ratings = JSON.parse(saved);
    }
}

// 下载CSV
function downloadCSV() {
    const rows = [
        ['用户ID', '病例编号', '任务1评分', '任务2评分', '任务3选择', '评分时间', '描述']
    ];
    
    // 遍历所有病例
    state.cases.forEach(caseData => {
        const caseId = caseData.pmid || caseData.id;
        
        // 检查该病例是否完成所有三个任务
        const task1Rating = state.ratings.task1[caseId];
        const task2Rating = state.ratings.task2[caseId];
        const task3Rating = state.ratings.task3[caseId];
        
        if (task1Rating && task2Rating && task3Rating) {
            rows.push([
                state.userId,
                caseId,
                task1Rating.value,
                task2Rating.value,
                task3Rating.value,
                task3Rating.timestamp,
                (caseData.prompt || caseData.description || '').substring(0, 100)
            ]);
        }
    });
    
    if (rows.length === 1) {
        showNotification('没有已完成的评分数据', 'warning');
        return;
    }
    
    // 生成CSV
    const csv = rows.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ratings_${state.userId}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    
    showNotification('CSV文件已下载', 'success');
}

// 显示配置弹窗
function showConfigModal() {
    const modal = document.getElementById('configModal');
    const input = document.getElementById('googleSheetsUrlInput');
    input.value = state.googleSheetsUrl || '';
    modal.classList.add('show');
}

// 隐藏配置弹窗
function hideConfigModal() {
    const modal = document.getElementById('configModal');
    modal.classList.remove('show');
}

// 保存配置
function saveConfig() {
    const url = document.getElementById('googleSheetsUrlInput').value.trim();
    if (!url) {
        showNotification('请输入有效的URL', 'warning');
        return;
    }
    
    state.googleSheetsUrl = url;
    localStorage.setItem('googleSheetsUrl', url);
    hideConfigModal();
    showNotification('配置已保存', 'success');
}

// 加载配置
function loadConfig() {
    const savedUrl = localStorage.getItem('googleSheetsUrl');
    if (savedUrl) {
        state.googleSheetsUrl = savedUrl;
    }
}

// 提交数据到Google表格
async function submitToGoogleSheets() {
    if (!state.googleSheetsUrl) {
        console.warn('Google Sheets URL未配置');
        return false;
    }
    
    const caseData = state.cases[state.currentIndex];
    const caseId = caseData.pmid || caseData.id;
    
    // 获取三个任务的评分
    const task1Rating = state.ratings.task1[caseId];
    const task2Rating = state.ratings.task2[caseId];
    const task3Rating = state.ratings.task3[caseId];
    
    if (!task1Rating || !task2Rating || !task3Rating) {
        console.error('评分数据不完整');
        return false;
    }
    
    const payload = {
        userId: state.userId,
        caseId: caseId,
        task1Score: task1Rating.value,
        task2Score: task2Rating.value,
        task3Choice: task3Rating.value,
        timestamp: new Date().toISOString(),
        prompt: (caseData.prompt || caseData.description || '').substring(0, 500)
    };
    
    try {
        const response = await fetch(state.googleSheetsUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        console.log('数据已提交到Google表格');
        showNotification('评分已保存到云端', 'success');
        return true;
    } catch (error) {
        console.error('提交到Google表格失败:', error);
        showNotification('云端保存失败，已保存到本地', 'warning');
        return false;
    }
}

// 批量提交所有已完成的评分
async function submitAllCompletedRatings() {
    if (!state.googleSheetsUrl) {
        showNotification('请先配置Google Sheets URL', 'error');
        return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < state.cases.length; i++) {
        const caseData = state.cases[i];
        const caseId = caseData.pmid || caseData.id;
        
        // 检查该病例是否完成所有三个任务
        const task1Rating = state.ratings.task1[caseId];
        const task2Rating = state.ratings.task2[caseId];
        const task3Rating = state.ratings.task3[caseId];
        
        if (task1Rating && task2Rating && task3Rating) {
            const payload = {
                userId: state.userId,
                caseId: caseId,
                task1Score: task1Rating.value,
                task2Score: task2Rating.value,
                task3Choice: task3Rating.value,
                timestamp: task3Rating.timestamp,
                prompt: (caseData.prompt || caseData.description || '').substring(0, 500)
            };
            
            try {
                await fetch(state.googleSheetsUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`提交病例 ${caseId} 失败:`, error);
                failCount++;
            }
        }
    }
    
    showNotification(`成功提交 ${successCount} 条记录${failCount > 0 ? `，失败 ${failCount} 条` : ''}`, 'success');
}

// 显示通知
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    if (type === 'error') {
        notification.style.background = '#dc3545';
    } else if (type === 'warning') {
        notification.style.background = '#ffc107';
        notification.style.color = '#000';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);