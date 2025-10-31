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
    similarityData: {}, // 存储每个病例的相似度数据（不显示给用户）
    currentImageIndex: 0,
    googleSheetsUrl: localStorage.getItem('googleSheetsUrl') || 'https://script.google.com/macros/s/AKfycbw1Ak7TjFe6ryuWXGr42bnel-GT-URqvTPwA8D9-YOmbm4Ft6PmEQDrSlG02fYoFTDf/exec', // 从localStorage读取配置 // 在这里填入你的Google Apps Script Web App URL
    submittedCases: new Set() // 记录已提交的病例，避免重复提交
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
        
        // 加载已提交记录
        loadSubmittedCases();
        
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
    document.querySelectorAll('.choice-btn-large').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const choice = e.currentTarget.dataset.choice;
            setRating('task3', choice);
        });
    });

    // 任务3诊断框点击（使用新的样式）
    document.querySelectorAll('.task-section:nth-child(6) .diagnosis-box').forEach((box, index) => {
        box.addEventListener('click', (e) => {
            // 如果点击的是按钮，不处理
            if (e.target.classList.contains('choice-btn-large')) return;
            const choice = index === 0 ? 'A' : 'B';
            setRating('task3', choice);
        });
        box.style.cursor = 'pointer';
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
    
    // 加载任务3: 鉴别诊断选择
    loadTask3(caseData);
    
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

// 加载任务3 - 鉴别诊断对比选择
function loadTask3(caseData) {
    // 获取两对诊断数据
    const pairs = caseData.task3_pairs || [];
    
    if (pairs.length >= 2) {
        // 对A
        const pairA = pairs[0];
        document.getElementById('task3_pairA_predicted').textContent = pairA.predicted || '无预测诊断';
        document.getElementById('task3_pairA_truth').textContent = pairA.ground_truth || '无真实诊断';
        
        // 对B
        const pairB = pairs[1];
        document.getElementById('task3_pairB_predicted').textContent = pairB.predicted || '无预测诊断';
        document.getElementById('task3_pairB_truth').textContent = pairB.ground_truth || '无真实诊断';
        
        // 存储相似度用于后续分析（不在界面显示）
        const caseId = caseData.pmid || caseData.id;
        if (!state.similarityData) state.similarityData = {};
        state.similarityData[caseId] = {
            pairA_similarity: pairA.similarity,
            pairB_similarity: pairB.similarity
        };
    } else {
        // 如果数据不足，显示提示信息
        document.getElementById('task3_pairA_predicted').textContent = '数据不足';
        document.getElementById('task3_pairA_truth').textContent = '数据不足';
        document.getElementById('task3_pairB_predicted').textContent = '数据不足';
        document.getElementById('task3_pairB_truth').textContent = '数据不足';
    }
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
    
    // 检查是否完成所有三个任务
    const allCompleted = isCurrentCaseCompleted();
    
    // 更新导航按钮
    updateNavigationButtons();
    
    // 如果三个任务都完成了，自动提交到Google Sheets
    if (allCompleted && !state.submittedCases.has(caseId)) {
        submitToGoogleSheets();
    }
    
    // 更新进度条显示
    renderCaseProgress();
    
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
        // 鉴别诊断选择
        document.querySelectorAll('.choice-btn-large').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.choice === value);
        });
        // 高亮选中的诊断框
        document.querySelectorAll('.task-section:nth-child(6) .diagnosis-box').forEach((box, index) => {
            const choice = index === 0 ? 'A' : 'B';
            if (choice === value) {
                box.style.borderWidth = '3px';
                box.style.transform = 'scale(1.02)';
                box.style.boxShadow = '0 6px 20px rgba(33, 147, 176, 0.3)';
            } else {
                box.style.borderWidth = '0';
                box.style.transform = 'scale(1)';
                box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            }
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
        document.querySelectorAll('.choice-btn-large').forEach(btn => {
            btn.classList.remove('selected');
        });
        // 重置诊断框样式
        document.querySelectorAll('.task-section:nth-child(6) .diagnosis-box').forEach(box => {
            box.style.borderWidth = '0';
            box.style.transform = 'scale(1)';
            box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
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
function navigateCase(direction) {
    const newIndex = state.currentIndex + direction;
    
    if (newIndex >= 0 && newIndex < state.cases.length) {
        // 检查当前病例是否完成
        if (direction > 0 && !isCurrentCaseCompleted()) {
            showNotification('请完成所有三项任务后再进入下一病例', 'warning');
            return;
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
    
    // 渲染病例进度条
    renderCaseProgress();
}

// 渲染病例进度条
function renderCaseProgress() {
    const container = document.getElementById('caseProgressContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    state.cases.forEach((caseItem, index) => {
        const ball = document.createElement('div');
        ball.className = 'case-progress-item';
        ball.textContent = index + 1;
        ball.title = `病例 ${index + 1}`;
        
        // 检查该病例是否完成
        const caseId = caseItem.pmid || caseItem.id;
        const isCompleted = ['task1', 'task2', 'task3'].every(taskId => 
            state.ratings[taskId][caseId] !== undefined
        );
        
        if (isCompleted) {
            ball.classList.add('rated');
        }
        
        if (index === state.currentIndex) {
            ball.classList.add('active');
        }
        
        // 点击跳转到对应病例
        ball.addEventListener('click', () => {
            if (index !== state.currentIndex) {
                loadCase(index);
                window.scrollTo(0, 0);
            }
        });
        
        container.appendChild(ball);
    });
    
    // 滚动到当前激活的球
    const activeBall = container.querySelector('.case-progress-item.active');
    if (activeBall) {
        setTimeout(() => {
            activeBall.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 100);
    }
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

// 加载已提交记录
function loadSubmittedCases() {
    const saved = localStorage.getItem('submitted_' + state.userId);
    if (saved) {
        state.submittedCases = new Set(JSON.parse(saved));
    }
}

// 保存已提交记录
function saveSubmittedCases() {
    localStorage.setItem('submitted_' + state.userId, JSON.stringify([...state.submittedCases]));
}

// 下载CSV
function downloadCSV() {
    const rows = [
        ['用户ID', '病例编号', '任务1评分', '任务2评分', '任务3选择', '对A相似度', '对B相似度', '用户选择正确', '评分时间', '描述']
    ];
    
    // 遍历所有病例
    state.cases.forEach(caseData => {
        const caseId = caseData.pmid || caseData.id;
        
        // 检查该病例是否完成所有三个任务
        const task1Rating = state.ratings.task1[caseId];
        const task2Rating = state.ratings.task2[caseId];
        const task3Rating = state.ratings.task3[caseId];
        
        if (task1Rating && task2Rating && task3Rating) {
            const similarityData = state.similarityData[caseId] || {};
            const pairA_sim = similarityData.pairA_similarity || 0;
            const pairB_sim = similarityData.pairB_similarity || 0;
            
            // 判断用户选择是否正确（选择了相似度更高的对）
            let isCorrect = '';
            if (pairA_sim !== pairB_sim) {
                const correctChoice = pairA_sim > pairB_sim ? 'A' : 'B';
                isCorrect = task3Rating.value === correctChoice ? '正确' : '错误';
            }
            
            rows.push([
                state.userId,
                caseId,
                task1Rating.value,
                task2Rating.value,
                task3Rating.value,
                pairA_sim.toFixed(4),
                pairB_sim.toFixed(4),
                isCorrect,
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

// 提交数据到Google表格 - 只在完成所有3个任务后调用一次
async function submitToGoogleSheets() {
    if (!state.googleSheetsUrl || state.googleSheetsUrl.length < 10) {
        console.log('Google Sheets同步未启用（未配置URL）');
        return false;
    }
    
    if (!state.googleSheetsUrl.includes('script.google.com')) {
        console.warn('Google Sheets URL格式不正确');
        return false;
    }
    
    const caseData = state.cases[state.currentIndex];
    const caseId = caseData.pmid || caseData.id;
    
    // 检查是否已提交过
    if (state.submittedCases.has(caseId)) {
        console.log(`病例 ${caseId} 已提交过，跳过重复提交`);
        return true;
    }
    
    // 获取三个任务的评分
    const task1Rating = state.ratings.task1[caseId];
    const task2Rating = state.ratings.task2[caseId];
    const task3Rating = state.ratings.task3[caseId];
    
    if (!task1Rating || !task2Rating || !task3Rating) {
        console.error('评分数据不完整，无法提交');
        return false;
    }
    
    const payload = {
        userId: state.userId,
        caseIndex: state.currentIndex + 1,
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
        
        // 标记为已提交
        state.submittedCases.add(caseId);
        saveSubmittedCases();
        
        console.log(`病例 ${caseId} 数据已提交到Google表格`);
        showNotification('评分已自动保存到云端', 'success');
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
    let skippedCount = 0;
    
    for (let i = 0; i < state.cases.length; i++) {
        const caseData = state.cases[i];
        const caseId = caseData.pmid || caseData.id;
        
        // 跳过已提交的
        if (state.submittedCases.has(caseId)) {
            skippedCount++;
            continue;
        }
        
        // 检查该病例是否完成所有三个任务
        const task1Rating = state.ratings.task1[caseId];
        const task2Rating = state.ratings.task2[caseId];
        const task3Rating = state.ratings.task3[caseId];
        
        if (task1Rating && task2Rating && task3Rating) {
            const payload = {
                userId: state.userId,
                caseIndex: i + 1,
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
                
                // 标记为已提交
                state.submittedCases.add(caseId);
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`提交病例 ${caseId} 失败:`, error);
                failCount++;
            }
        }
    }
    
    // 保存已提交记录
    saveSubmittedCases();
    
    let message = `成功提交 ${successCount} 条记录`;
    if (skippedCount > 0) message += `，跳过 ${skippedCount} 条已提交`;
    if (failCount > 0) message += `，失败 ${failCount} 条`;
    
    showNotification(message, 'success');
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
// 检查是否完成所有评分
function checkIfAllCompleted() {
    let completedCount = 0;
    
    state.cases.forEach(caseData => {
        const caseId = caseData.pmid || caseData.id;
        const task1 = state.ratings.task1[caseId];
        const task2 = state.ratings.task2[caseId];
        const task3 = state.ratings.task3[caseId];
        
        if (task1 && task2 && task3) {
            completedCount++;
        }
    });
    
    if (completedCount === state.cases.length && state.cases.length > 0) {
        showCompletionPage();
    }
}

// 显示结束页面
function showCompletionPage() {
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('completionPage').style.display = 'block';
    
    // 计算统计数据
    calculateAndDisplayStats();
}

// 计算并显示统计数据
function calculateAndDisplayStats() {
    let task1Sum = 0, task1Count = 0;
    let task2Sum = 0, task2Count = 0;
    let task3Correct = 0, task3Total = 0;
    
    state.cases.forEach(caseData => {
        const caseId = caseData.pmid || caseData.id;
        
        const task1 = state.ratings.task1[caseId];
        const task2 = state.ratings.task2[caseId];
        const task3 = state.ratings.task3[caseId];
        
        if (task1) {
            task1Sum += task1.value;
            task1Count++;
        }
        
        if (task2) {
            task2Sum += task2.value;
            task2Count++;
        }
        
        if (task3) {
            task3Total++;
            const similarityData = state.similarityData[caseId];
            if (similarityData) {
                const pairA_sim = similarityData.pairA_similarity || 0;
                const pairB_sim = similarityData.pairB_similarity || 0;
                
                if (pairA_sim !== pairB_sim) {
                    const correctChoice = pairA_sim > pairB_sim ? 'A' : 'B';
                    if (task3.value === correctChoice) {
                        task3Correct++;
                    }
                }
            }
        }
    });
    
    // 显示统计数据
    document.getElementById('totalCompletedCases').textContent = task3Total;
    document.getElementById('task1AvgScore').textContent = task1Count > 0 ? (task1Sum / task1Count).toFixed(2) : '-';
    document.getElementById('task2AvgScore').textContent = task2Count > 0 ? (task2Sum / task2Count).toFixed(2) : '-';
    document.getElementById('task3AccuracyRate').textContent = task3Total > 0 ? ((task3Correct / task3Total) * 100).toFixed(1) + '%' : '-';
}

// 下载JSON文件
function downloadJSON() {
    const exportData = {
        userId: state.userId,
        sessionId: state.sessionId,
        exportTime: new Date().toISOString(),
        totalCases: state.cases.length,
        ratings: state.ratings,
        similarityData: state.similarityData,
        cases: []
    };
    
    // 添加每个病例的详细信息
    state.cases.forEach(caseData => {
        const caseId = caseData.pmid || caseData.id;
        const task1 = state.ratings.task1[caseId];
        const task2 = state.ratings.task2[caseId];
        const task3 = state.ratings.task3[caseId];
        
        if (task1 && task2 && task3) {
            const similarityData = state.similarityData[caseId] || {};
            
            exportData.cases.push({
                caseId: caseId,
                pmid: caseData.pmid,
                task1_score: task1.value,
                task1_timestamp: task1.timestamp,
                task2_score: task2.value,
                task2_timestamp: task2.timestamp,
                task3_choice: task3.value,
                task3_timestamp: task3.timestamp,
                pairA_similarity: similarityData.pairA_similarity,
                pairB_similarity: similarityData.pairB_similarity,
                prompt: caseData.prompt
            });
        }
    });
    
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ratings_${state.userId}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    
    showNotification('JSON文件已下载', 'success');
}

// 重新开始（清空数据）
function restartRating() {
    if (!confirm('确定要清空所有评分数据并重新开始吗？此操作不可恢复！')) {
        return;
    }
    
    // 清空localStorage
    localStorage.removeItem('ratings_' + state.userId);
    localStorage.removeItem('submitted_' + state.userId);
    
    // 重置状态
    state.ratings = {
        task1: {},
        task2: {},
        task3: {}
    };
    state.similarityData = {};
    state.submittedCases = new Set();
    state.currentIndex = 0;
    
    // 隐藏结束页面
    document.getElementById('completionPage').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    
    // 重新加载第一个病例
    loadCase(0);
    
    showNotification('已清空所有数据，重新开始评分', 'success');
}

// 修改原有的 setupEventListeners 函数
const originalSetupEventListeners = setupEventListeners;
setupEventListeners = function() {
    originalSetupEventListeners();
    
    // 添加结束页面的事件监听
    document.getElementById('downloadCsvBtnFinal').addEventListener('click', downloadCSV);
    document.getElementById('downloadJsonBtn').addEventListener('click', downloadJSON);
    document.getElementById('restartBtn').addEventListener('click', restartRating);
};

// 修改任务完成后的检查
const originalSetRating = setRating;
setRating = function(taskId, value) {
    originalSetRating(taskId, value);
    
    // 检查是否完成所有评分
    setTimeout(() => {
        checkIfAllCompleted();
    }, 500);
};