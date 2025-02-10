let currentSessionId = null;
const eventSource = null;

// 加载历史对话
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return '今天';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return '昨天';
    } else {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }
}

function loadHistory() {
    fetch('/api/history')
        .then(response => response.json())
        .then(history => {
            const historyList = document.getElementById('history-list');
            historyList.innerHTML = '';
            
            // 找到最新的会话
            let latestSession = null;
            let latestTimestamp = 0;
            
            // 按日期分组
            const groups = {};
            Object.entries(history).forEach(([sessionId, session]) => {
                const date = session.timestamp.split(' ')[0];
                if (!groups[date]) {
                    groups[date] = [];
                }
                groups[date].push([sessionId, session]);
                
                // 更新最新会话
                const timestamp = new Date(session.timestamp).getTime();
                if (timestamp > latestTimestamp) {
                    latestTimestamp = timestamp;
                    latestSession = sessionId;
                }
            });
            
            // 按日期排序并显示
            Object.entries(groups)
                .sort((a, b) => new Date(b[0]) - new Date(a[0]))
                .forEach(([date, sessions]) => {
                    const dateDiv = document.createElement('div');
                    dateDiv.className = 'history-date';
                    dateDiv.textContent = formatDate(date);
                    historyList.appendChild(dateDiv);
                    
                    // 按时间倒序排序会话
                    sessions
                        .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp))
                        .forEach(([sessionId, session]) => {
                            const historyItem = document.createElement('div');
                            historyItem.className = 'history-item';
                            
                            const titleSpan = document.createElement('span');
                            titleSpan.className = 'history-title';
                            titleSpan.textContent = session.title;
                            
                            const renameButton = document.createElement('button');
                            renameButton.className = 'rename-button';
                            renameButton.innerHTML = `
                                <svg class="rename-icon" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                </svg>
                            `;
                            
                            renameButton.onclick = (e) => {
                                e.stopPropagation();
                                titleSpan.contentEditable = true;
                                titleSpan.focus();
                            };
                            
                            titleSpan.onblur = () => {
                                titleSpan.contentEditable = false;
                                const newTitle = titleSpan.textContent.trim();
                                if (newTitle && newTitle !== session.title) {
                                    fetch(`/api/session/${sessionId}/title`, {
                                        method: 'PUT',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({ title: newTitle })
                                    });
                                }
                            };
                            
                            titleSpan.onkeypress = (e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    titleSpan.blur();
                                }
                            };
                            
                            historyItem.appendChild(titleSpan);
                            historyItem.appendChild(renameButton);
                            historyItem.onclick = () => loadSession(sessionId);
                            
                            historyList.appendChild(historyItem);
                        });
                });
            
            // 如果有会话且当前没有选中的会话，自动加载最新的会话
            if (latestSession && !currentSessionId) {
                loadSession(latestSession);
            }
        });
}

// 加载特定会话
function loadSession(sessionId) {
    currentSessionId = sessionId;
    updateHeaderButtons();
    fetch(`/api/session/${sessionId}`)
        .then(response => response.json())
        .then(session => {
            const chatMessages = document.getElementById('chat-messages');
            chatMessages.innerHTML = '';
            
            session.messages.forEach(message => {
                appendMessage(message.content, message.role);
            });
        });
}

// 添加复制功能
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // 成功复制后的处理
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}

// 初始化 markdown-it 和插件
const md = window.markdownit({
    html: true,        // 启用 HTML 标签
    breaks: true,      // 转换换行符为 <br>
    linkify: true,     // 自动转换 URL 为链接
    typographer: true  // 启用typographer处理一些常见的符号转换
});

// 逐步添加 mermaid 和 table 插件（只在需要时启用）
function enableMermaidAndTable() {
    md.use(window.markdownitMermaid);  // 添加 mermaid 插件
    md.use(window.markdownitTable);   // 添加表格插件
}

// 初始化 mermaid
// mermaid.initialize({startOnLoad: true});


// 修改 markdown 渲染函数
function renderMarkdown(text) {    
    const processedText = text;

    // 渲染 markdown
    return md.render(processedText);
}

function splitText(text) {
    const itemizeRegex = /\\begin{itemize}[\s\S]*?\\end{itemize}/g;
    const result = [];
    let lastIndex = 0;
    let match;
  
    // 处理所有itemize块
    while ((match = itemizeRegex.exec(text)) !== null) {
      // 处理itemize块之前的普通文本
      const before = text.slice(lastIndex, match.index);
      if (before) {
        before.split(/\n{2,}/)                     // 按两个以上换行符分割
             .map(p => p.trim().replace(/\n+/g, ' ')) // 清理段落格式
             .filter(p => p)                        // 移除空段落
             .forEach(p => result.push(p));
      }
      
      // 添加itemize块到结果
      result.push(match[0].trim());
      lastIndex = itemizeRegex.lastIndex;
    }
  
    // 处理剩余文本
    const remaining = text.slice(lastIndex);
    if (remaining) {
      remaining.split(/\n{2,}/)                   // 按两个以上换行符分割
               .map(p => p.trim().replace(/\n+/g, ' ')) // 清理段落格式
               .filter(p => p)                     // 移除空段落
               .forEach(p => result.push(p));
    }
  
    return result;
  }
  
// 修改 LaTeX 渲染函数
function renderLatex(text) {
    const div = document.createElement('div');
    div.className = 'latex-content';

    // 将 LaTeX 文本分成段落
    // const paragraphs = text.split(/\n\n+/);
    const paragraphs = splitText(text);
    console.log(paragraphs);
    
    paragraphs.forEach(paragraph => {
        if (!paragraph.trim()) return;

        // 检查段落类型并相应处理
        
        // if (paragraph.startsWith('\\begin{itemize}')) {
        //     const ul = document.createElement('ul');
        //     const items = paragraph.match(/\\item\s+(.*?)(?=\\item|\\end{itemize})/g);
        //     if (items) {
        //         items.forEach(item => {
        //             const li = document.createElement('li');
        //             li.textContent = item.replace(/\\item\s+/, '');
        //             ul.appendChild(li);
        //         });
        //     }
        //     div.appendChild(ul);
        // }
       
        if (paragraph.startsWith('\\begin{itemize}')) {
            const ul = document.createElement('ul');
            
            // Step1: Robust item extraction with multiline support
            const items = [];
            const itemRegex = /\\item([\s\S]*?)(?=\s*\\item|\s*\\end{itemize})/gs;
            
            let match;
            while ((match = itemRegex.exec(paragraph)) !== null) {
                const rawContent = match[1].replace(/^\s+/, '').replace(/\s+$/, ''); // Trim whitespace
                items.push(rawContent);
            }
    
            // Step2: Process each item content
            items.forEach(rawText => {
                const li = document.createElement('li');
                
                // Step3: Split text and formulas accurately 
                const splitRegex = /(\${1,2}(?:\\.|[^$\n])*?\${1,2})/g; // Enhanced regex for formulas
                const segments = rawText.split(splitRegex).filter(s => s.trim() !== '');
                console.log(segments);
                segments.forEach(segment => {
                    if (segment.startsWith('$$') || segment.startsWith('\\begin{equation}')) {
                        const mathDiv = document.createElement('div');
                        try {
                            katex.render(
                                segment.replace(/^\$\$|\$\$$|\\begin{equation}|\\end{equation}/g, ''),
                                mathDiv,
                                { displayMode: true }
                            );
                            li.appendChild(mathDiv);
                        } catch (e) {
                            console.error('Error rendering math:', e);
                            li.appendChild(document.createTextNode(segment));
                        }
                    } else if (segment.startsWith('$')) {
                        const mathSpan = document.createElement('span');
                        try {
                            katex.render(
                                segment.replace(/^\$|\$/g, ''),
                                mathSpan,
                                { displayMode: false }
                            );
                            li.appendChild(mathSpan);
                        } catch (e) {
                            console.error('Error rendering inline math:', e);
                            li.appendChild(document.createTextNode(segment));
                        }
                    } else if (segment.trim()) {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = segment;
                        while (tempDiv.firstChild) {
                            li.appendChild(tempDiv.firstChild);
                        }
                    }
                    // if (segment.startsWith('$') && segment.endsWith('$')) { 
                    //     // Handle LaTeX math content
                    //     try {
                    //         const span = document.createElement('span');
                    //         katex.render(segment.replace(/\\\\/g, '\\\\'), span, { 
                    //             throwOnError: false,
                    //             displayMode: segment.startsWith('$$'),
                    //             strict: false // Allow some informal syntax
                    //         });
                            
                    //         li.appendChild(span);
                    //     } catch (e) {
                    //         li.appendChild(document.createTextNode(`[Math Error: ${e.message}]`));
                    //     }
                    // } else { 
                    //     // Handle plain text with preserved \text{} commands
                    //     li.appendChild(
                    //         document.createTextNode(
                    //             segment.replace(/\\\\/g, '') // Cleanup line breaks
                    //                    .replace(/\\text\{([^}]+)\}/g, '$1') // Extract \text content
                    //         )
                    //     );
                    // }
                });
    
                ul.appendChild(li);
            });
    
            div.appendChild(ul);
        }
        else if (paragraph.startsWith('\\begin{enumerate}')) {
            const ol = document.createElement('ol');
            const items = paragraph.match(/\\item\s+(.*?)(?=\\item|\\end{enumerate})/g);
            if (items) {
                items.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = item.replace(/\\item\s+/, '');
                    ol.appendChild(li);
                });
            }
            div.appendChild(ol);
        }
        else if (paragraph.startsWith('\\begin{quote}')) {
            const match = paragraph.match(/\\begin{quote}([\s\S]*?)\\end{quote}/);
            if (match) {
                const blockquote = document.createElement('blockquote');
                blockquote.textContent = match[1].trim();
                div.appendChild(blockquote);
            }
        }
        else if (paragraph.startsWith('\\begin{verbatim}')) {
            const match = paragraph.match(/\\begin{verbatim}([\s\S]*?)\\end{verbatim}/);
            if (match) {
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.textContent = match[1].trim();
                pre.appendChild(code);
                div.appendChild(pre);
            }
        }
        else if (paragraph.startsWith('\\begin{tabular}')) {
            const table = document.createElement('table');
            const tbody = document.createElement('tbody');
            const content = paragraph.match(/\\begin{tabular}.*?\}([\s\S]*?)\\end{tabular}/);
            if (content) {
                const rows = content[1].trim().split('\\\\');
                rows.forEach(row => {
                    const tr = document.createElement('tr');
                    const cells = row.split('&');
                    cells.forEach(cell => {
                        const td = document.createElement('td');
                        td.textContent = cell.trim();
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
            }
            table.appendChild(tbody);
            div.appendChild(table);
        }
        else{
            if (paragraph.startsWith('\\section{')) {
                const match = paragraph.match(/\\section{(.*?)}/);
                if (match) {
                    // console.log(paragraph);
                    const h1 = document.createElement('h1');
                    h1.textContent = match[1];
                    div.appendChild(h1);
                }
            }
            else if (paragraph.startsWith('\\subsection{')) {
                const match = paragraph.match(/\\subsection{(.*?)}/);
                if (match) {
                    console.log(paragraph);
                    const h2 = document.createElement('h2');
                    h2.textContent = match[1];
                    div.appendChild(h2);
                }
            }
            else if (paragraph.startsWith('\\subsubsection{')) {
                const match = paragraph.match(/\\subsubsection{(.*?)}/);
                if (match) {
                    console.log(paragraph);
                    const h3 = document.createElement('h3');
                    h3.textContent = match[1];
                    div.appendChild(h3);
                }
            }            
            // 处理普通段落，包括内联元素
            const p = document.createElement('p');
            let content = paragraph;

            // 处理内联元素
            content = content
                .replace(/\\subsection{(.*?)}/g, '')
                .replace(/\\subsubsection{(.*?)}/g, '')
                .replace(/\\section{(.*?)}/g, '')
                .replace(/\\label{(.*?)}/g, '')
                .replace(/\\textbf{(.*?)}/g, '<strong>$1</strong>')
                .replace(/\\textit{(.*?)}/g, '<em>$1</em>')
                .replace(/\\emph{(.*?)}/g, '<em>$1</em>')
                .replace(/\\underline{(.*?)}/g, '<u>$1</u>')
                .replace(/\\texttt{(.*?)}/g, '<code>$1</code>')
                .replace(/\\verb\|(.*?)\|/g, '<code>$1</code>')
                .replace(/\\footnote{(.*?)}/g, '<sup>$1</sup>')
                .replace(/\\url{(.*?)}/g, '<a href="$1">$1</a>')
                .replace(/\\href{(.*?)}{(.*?)}/g, '<a href="$1">$2</a>')
                .replace(/\\chapter{(.*?)}/g, '<h1>$1</h1>')
                .replace(/\\paragraph{(.*?)}/g, '<h4>$1</h4>')
                .replace(/\\subparagraph{(.*?)}/g, '<h5>$1</h5>');

            // 处理数学公式
            const segments = content.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\begin{equation}[\s\S]*?\\end{equation}|\\begin{align\*}[\s\S]*?\\end{align\*}|\\begin{align}[\s\S]*?\\end{align})/g);
            
            segments.forEach(segment => {
                if (segment.startsWith('$$') || 
                    segment.startsWith('\\begin{equation}') || 
                    segment.startsWith('\\begin{align') // 匹配 align 和 align*
                ) {
                    const mathDiv = document.createElement('div');
                    try {
                        // 预处理 align 环境中的内容
                        let formula = segment;
                        if (segment.includes('\\begin{align')) {
                                        // 移除对齐符号 &
                            formula = formula.replace(/&/g, '');
                            // 将 \\ 替换为单个换行符
                            formula = formula.replace(/\\\\/g, '\\quad');
                        }
                        
                        // 移除环境标记
                        formula = formula.replace(/^\$\$|\$\$$|\\begin{equation}|\\end{equation}|\\begin{align\*}|\\end{align\*}|\\begin{align}|\\end{align}/g, '');
                        
                        katex.render(
                            formula.trim(),
                            mathDiv,
                            { 
                                displayMode: true,
                                throwOnError: false
                            }
                        );
                        p.appendChild(mathDiv);
                    } catch (e) {
                        console.error('Error rendering math:', e);
                        p.appendChild(document.createTextNode(segment));
                    }
                } else if (segment.startsWith('$')) {
                    const mathSpan = document.createElement('span');
                    try {
                        katex.render(
                            segment.replace(/^\$|\$/g, ''),
                            mathSpan,
                            { displayMode: false }
                        );
                        p.appendChild(mathSpan);
                    } catch (e) {
                        console.error('Error rendering inline math:', e);
                        p.appendChild(document.createTextNode(segment));
                    }
                } else if (segment.trim()) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = segment;
                    while (tempDiv.firstChild) {
                        p.appendChild(tempDiv.firstChild);
                    }
                }
            });

            if (p.hasChildNodes()) {
                div.appendChild(p);
            }
        }
    });

    return div.innerHTML;
}

// 添加检测文本格式的函数
function detectTextFormat(text) {
    // LaTeX 特征检测
    const latexPatterns = [
        /\\section{/,
        /\\subsection{/,
        /\\begin{/,
        /\\end{/,
        /\\textbf{/,
        /\\textit{/,
        /\\item/,
        /\\chapter{/,
        /\\paragraph{/
    ];
    
    // Markdown 特征检测
    const markdownPatterns = [
        /^#\s+/m,      // 标题
        /^\*\s+/m,     // 无序列表
        /^-\s+/m,      // 无序列表
        /^>\s+/m,      // 引用
        /`[^`]+`/,     // 行内代码
        /\*\*[^*]+\*\*/, // 粗体
        /\*[^*]+\*/,   // 斜体
        /\[[^\]]+\]\([^\)]+\)/, // 链接
        /```[\s\S]+```/  // 代码块
    ];

    let latexScore = 0;
    let markdownScore = 0;

    latexPatterns.forEach(pattern => {
        if (pattern.test(text)) latexScore++;
    });

    markdownPatterns.forEach(pattern => {
        if (pattern.test(text)) markdownScore++;
    });

    // 如果都没有特征，默认为 markdown
    if (latexScore === 0 && markdownScore === 0) return 'markdown';
    
    return latexScore > markdownScore ? 'latex' : 'markdown';
}

// 修改消息操作按钮创建函数
function createMessageActions(content, messageDiv) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    
    // 复制按钮
    const copyButton = document.createElement('button');
    copyButton.className = 'action-button';
    copyButton.textContent = '复制';
    copyButton.onclick = () => {
        copyToClipboard(content);
        copyButton.textContent = '已复制';
        setTimeout(() => {
            copyButton.textContent = '复制';
        }, 2000);
    };
    
    // 原文按钮
    const rawButton = document.createElement('button');
    rawButton.className = 'action-button';
    rawButton.textContent = '原文';
    
    // LaTeX按钮
    const latexButton = document.createElement('button');
    latexButton.className = 'action-button';
    latexButton.textContent = 'LaTeX';
    
    // Markdown按钮
    const mdButton = document.createElement('button');
    mdButton.className = 'action-button';
    mdButton.textContent = 'MD';
    
    // 检测默认格式并设置初始渲染
    let currentMode = detectTextFormat(content);
    
    function updateContent(mode) {
        currentMode = mode;
        // 更新按钮状态
        rawButton.classList.toggle('active', mode === 'raw');
        latexButton.classList.toggle('active', mode === 'latex');
        mdButton.classList.toggle('active', mode === 'markdown');
        
        // 更新内容和样式
        switch(mode) {
            case 'raw':
                messageDiv.classList.remove('markdown-content');  // 移除 markdown 样式
                messageDiv.style.whiteSpace = 'pre-wrap';  // 保持原始格式
                messageDiv.style.overflowWrap = 'normal';
                messageDiv.textContent = content;
                break;
            case 'latex':
                messageDiv.classList.add('markdown-content');
                messageDiv.innerHTML = renderLatex(content);
                break;
            case 'markdown':
                messageDiv.classList.add('markdown-content');
                messageDiv.style.whiteSpace = '';  // 保持原始格式
                messageDiv.innerHTML = renderMarkdown(content);
                break;
        }
    }
    
    rawButton.onclick = () => {
        updateContent(currentMode === 'raw' ? detectTextFormat(content) : 'raw');
    };
    
    latexButton.onclick = () => {
        updateContent(currentMode === 'latex' ? detectTextFormat(content) : 'latex');
    };
    
    mdButton.onclick = () => {
        updateContent(currentMode === 'markdown' ? detectTextFormat(content) : 'markdown');
    };
    
    actionsDiv.appendChild(copyButton);
    actionsDiv.appendChild(rawButton);
    actionsDiv.appendChild(latexButton);
    actionsDiv.appendChild(mdButton);
    
    // 初始渲染
    updateContent(currentMode);
    
    return actionsDiv;
}

// 修改消息添加函数
function appendMessage(content, role) {
    const chatMessages = document.getElementById('chat-messages');
    const messageContainer = document.createElement('div');
    messageContainer.className = `message-container ${role}-container`;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message markdown-content`;
    
    messageContainer.appendChild(messageDiv);
    
    // 添加操作按钮
    const actionsDiv = createMessageActions(content, messageDiv);
    messageContainer.appendChild(actionsDiv);
    
    chatMessages.appendChild(messageContainer);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 加载服务商和API keys
function loadProviders() {
    fetch('/api/providers')
        .then(response => response.json())
        .then(providers => {
            const providerSelect = document.getElementById('provider-select');
            providerSelect.innerHTML = '';
            
            Object.entries(providers).forEach(([providerId, provider]) => {
                const option = document.createElement('option');
                option.value = providerId;
                option.textContent = provider.name;
                providerSelect.appendChild(option);
            });
            
            // 初始加载第一个服务商的API keys
            updateApiKeys(providers[Object.keys(providers)[0]].api_keys);
        });
}

// 更新API keys下拉框
function updateApiKeys(apiKeys) {
    const apiKeySelect = document.getElementById('api-key-select');
    apiKeySelect.innerHTML = '';
    
    Object.entries(apiKeys).forEach(([keyId, keyName]) => {
        const option = document.createElement('option');
        option.value = keyId;
        option.textContent = keyName;
        apiKeySelect.appendChild(option);
    });
}

// 添加服务商切换事件
document.getElementById('provider-select').onchange = function() {
    fetch('/api/providers')
        .then(response => response.json())
        .then(providers => {
            const selectedProvider = this.value;
            updateApiKeys(providers[selectedProvider].api_keys);
        });
};

// 修改发送消息函数
function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    appendMessage(message, 'user');
    input.value = '';
    input.style.height = '40px';  // 重置输入框高度
    
    // 修改加载消息的创建
    const messageContainer = document.createElement('div');
    messageContainer.className = 'message-container assistant-container';
    
    // 创建 reasoning 部分
    const reasoningDiv = document.createElement('div');
    reasoningDiv.className = 'reasoning-message';
    reasoningDiv.innerHTML = '<div class="reasoning-header">思考中...<span class="toggle-reasoning">[-]</span></div><div class="reasoning-content"></div>';
    
    // 创建内容部分（初始隐藏）
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message assistant-message markdown-content';
    contentDiv.style.display = 'none';  // 初始隐藏
    
    messageContainer.appendChild(reasoningDiv);
    messageContainer.appendChild(contentDiv);
    
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.appendChild(messageContainer);
    
    // 准备发送的数据
    const data = {
        message: message,
        session_id: currentSessionId,
        api_key: document.getElementById('api-key-select').value,
        provider: document.getElementById('provider-select').value
    };
    
    // 使用 fetch POST 请求
    fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }).then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        // 移除"请求中"的消息
        const loadingMessage = chatMessages.querySelector('.loading-message');
        if (loadingMessage) {
            loadingMessage.remove();
        }
        
        const reader = response.body.getReader();
        let decoder = new TextDecoder();
        let assistantMessage = '';
        
        function readStream() {
            reader.read().then(({done, value}) => {
                if (done) {
                    // 完成后添加操作按钮
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'message-actions';
                    
                    // 添加各种按钮...（代码保持不变）
                    
                    messageContainer.appendChild(actionsDiv);
                    loadHistory();
                    loadProviders();
                    return;
                }
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.reasoning_content) {
                                // 更新 reasoning 内容
                                const reasoningContent = reasoningDiv.querySelector('.reasoning-content');
                                reasoningContent.textContent = data.reasoning_content;
                            } else if (data.content) {
                                // 如果是第一次收到 content
                                if (!assistantMessage) {
                                    // 折叠 reasoning
                                    const reasoningContent = reasoningDiv.querySelector('.reasoning-content');
                                    const toggleButton = reasoningDiv.querySelector('.toggle-reasoning');
                                    reasoningContent.style.display = 'none';
                                    toggleButton.textContent = '[+]';
                                    
                                    // 显示内容区域
                                    contentDiv.style.display = 'block';
                                    
                                    // 添加复制按钮
                                    const copyButton = document.createElement('button');
                                    copyButton.className = 'copy-button';
                                    copyButton.textContent = '复制';
                                    copyButton.onclick = () => {
                                        copyToClipboard(assistantMessage);
                                        copyButton.textContent = '已复制';
                                        copyButton.classList.add('copy-success');
                                        setTimeout(() => {
                                            copyButton.textContent = '复制';
                                            copyButton.classList.remove('copy-success');
                                        }, 2000);
                                    };
                                    contentDiv.appendChild(copyButton);
                                }
                                
                                // 更新内容
                                assistantMessage += data.content;
                                
                                // 渲染内容
                                const format = detectTextFormat(assistantMessage);
                                switch(format) {
                                    case 'latex':
                                        contentDiv.innerHTML = renderLatex(assistantMessage);
                                        break;
                                    case 'markdown':
                                        contentDiv.innerHTML = renderMarkdown(assistantMessage);
                                        break;
                                    default:
                                        contentDiv.innerHTML = assistantMessage
                                            .replace(/\n/g, '<br>')
                                            .replace(/ /g, '&nbsp;');
                                }
                                
                                // 保持复制按钮
                                if (!contentDiv.querySelector('.copy-button')) {
                                    const copyButton = document.createElement('button');
                                    copyButton.className = 'copy-button';
                                    copyButton.textContent = '复制';
                                    copyButton.onclick = () => {
                                        copyToClipboard(assistantMessage);
                                        copyButton.textContent = '已复制';
                                        copyButton.classList.add('copy-success');
                                        setTimeout(() => {
                                            copyButton.textContent = '复制';
                                            copyButton.classList.remove('copy-success');
                                        }, 2000);
                                    };
                                    contentDiv.appendChild(copyButton);
                                }
                                
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data:', e);
                        }
                    }
                });
                
                readStream();
            });
        }
        
        readStream();
    })
    .catch(error => {
        console.error('Error:', error);
        // 显示详细错误消息
        const loadingMessage = chatMessages.querySelector('.loading-message');
        if (loadingMessage) {
            loadingMessage.textContent = `请求失败: ${error.message}`;
            loadingMessage.classList.add('error-message');
        }
    });
}

// 添加输入框自动调整高度的功能
document.getElementById('user-input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, window.innerHeight / 3) + 'px';
});

// 事件监听器
document.getElementById('send-button').onclick = sendMessage;
document.getElementById('user-input').onkeypress = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};

document.getElementById('new-chat').onclick = function() {
    currentSessionId = null;
    document.getElementById('chat-messages').innerHTML = '';
    updateHeaderButtons();
};

// 绑定右上角新建对话按钮
document.getElementById('new-chat-icon').onclick = function() {
    document.getElementById('new-chat').click();  // 触发左侧按钮的点击事件
};

// 添加侧边栏展开/折叠功能
function initSidebarToggle() {
    const sidebar = document.querySelector('.sidebar');
    const toggle = document.querySelector('.sidebar-toggle');
    const toggleIcon = toggle.querySelector('.toggle-icon');
    
    toggle.onclick = () => {
        sidebar.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
        toggleIcon.classList.toggle('collapsed');
    };
}

// 撤销最后一组对话
function undoLastMessage() {
    if (!currentSessionId) return;
    
    fetch('/api/undo', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ session_id: currentSessionId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadSession(currentSessionId);
        } else {
            console.error('Undo failed:', data.error);
        }
    })
    .catch(error => console.error('Error:', error));
}

// 同步备份记录
function syncBackup() {
    if (!currentSessionId) return;
    
    fetch('/api/sync', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ session_id: currentSessionId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadSession(currentSessionId);
        } else {
            console.error('Sync failed:', data.error);
        }
    })
    .catch(error => console.error('Error:', error));
}

// 添加事件监听器
document.getElementById('undo-chat-icon').onclick = undoLastMessage;
document.getElementById('sync-chat-icon').onclick = syncBackup;

// 更新按钮状态
function updateHeaderButtons() {
    const undoButton = document.getElementById('undo-chat-icon');
    const syncButton = document.getElementById('sync-chat-icon');
    
    undoButton.disabled = !currentSessionId;
    syncButton.disabled = !currentSessionId;
}

// 在加载会话和新建会话时更新按钮状态
function loadSession(sessionId) {
    currentSessionId = sessionId;
    updateHeaderButtons();
    fetch(`/api/session/${sessionId}`)
        .then(response => response.json())
        .then(session => {
            const chatMessages = document.getElementById('chat-messages');
            chatMessages.innerHTML = '';
            
            session.messages.forEach(message => {
                appendMessage(message.content, message.role);
            });
        });
}

// 在初始化部分添加
loadHistory();
loadProviders();
initSidebarToggle();



// 添加 reasoning 的折叠/展开功能
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('toggle-reasoning')) {
        const content = e.target.parentElement.nextElementSibling;
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        e.target.textContent = isHidden ? '[-]' : '[+]';
    }
}); 