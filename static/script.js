let currentSessionId = null;
const eventSource = null;

// 加载历史对话
function loadHistory() {
    fetch('/api/history')
        .then(response => response.json())
        .then(history => {
            const historyList = document.getElementById('history-list');
            historyList.innerHTML = '';
            
            Object.entries(history).reverse().forEach(([sessionId, session]) => {
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
}

// 加载特定会话
function loadSession(sessionId) {
    currentSessionId = sessionId;
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

// 修改 LaTeX 渲染函数
function renderLatex(text) {
    const div = document.createElement('div');
    div.className = 'latex-content';

    // 将 LaTeX 文本分成段落
    const paragraphs = text.split(/\n\n+/);
    
    paragraphs.forEach(paragraph => {
        if (!paragraph.trim()) return;

        // 检查段落类型并相应处理
        if (paragraph.startsWith('\\section{')) {
            const match = paragraph.match(/\\section{(.*?)}/);
            if (match) {
                const h1 = document.createElement('h1');
                h1.textContent = match[1];
                div.appendChild(h1);
            }
        }
        else if (paragraph.startsWith('\\subsection{')) {
            const match = paragraph.match(/\\subsection{(.*?)}/);
            if (match) {
                const h2 = document.createElement('h2');
                h2.textContent = match[1];
                div.appendChild(h2);
            }
        }
        else if (paragraph.startsWith('\\subsubsection{')) {
            const match = paragraph.match(/\\subsubsection{(.*?)}/);
            if (match) {
                const h3 = document.createElement('h3');
                h3.textContent = match[1];
                div.appendChild(h3);
            }
        }
        else if (paragraph.startsWith('\\begin{itemize}')) {
            const ul = document.createElement('ul');
            const items = paragraph.match(/\\item\s+(.*?)(?=\\item|\\end{itemize})/g);
            if (items) {
                items.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = item.replace(/\\item\s+/, '');
                    ul.appendChild(li);
                });
            }
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
        else {
            // 处理普通段落，包括内联元素
            const p = document.createElement('p');
            let content = paragraph;

            // 处理内联元素
            content = content
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
            const segments = content.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\begin{equation}[\s\S]*?\\end{equation})/g);
            
            segments.forEach(segment => {
                if (segment.startsWith('$$') || segment.startsWith('\\begin{equation}')) {
                    const mathDiv = document.createElement('div');
                    try {
                        katex.render(
                            segment.replace(/^\$\$|\$\$$|\\begin{equation}|\\end{equation}/g, ''),
                            mathDiv,
                            { displayMode: true }
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

// 加载 API keys
function loadApiKeys() {
    fetch('/api/keys')
        .then(response => response.json())
        .then(keys => {
            const select = document.getElementById('api-key-select');
            select.innerHTML = '';
            
            Object.entries(keys).forEach(([key, info]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = info.name;
                select.appendChild(option);
            });
        });
}

// 修改发送消息函数
function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    const apiKey = document.getElementById('api-key-select').value;
    
    if (!message) return;
    
    appendMessage(message, 'user');
    input.value = '';
    input.style.height = '40px';  // 重置输入框高度
    
    // 添加"请求中"的消息
    const chatMessages = document.getElementById('chat-messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant-message loading-message';
    loadingDiv.textContent = '请求中...';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // 准备发送的数据
    const data = {
        message: message,
        session_id: currentSessionId,
        api_key: apiKey
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
                    loadHistory();  // 加载更新后的历史记录
                    loadApiKeys();
                    return;
                }
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            assistantMessage += data.content;
                            
                            // 更新或创建助手消息
                            let assistantDiv = chatMessages.querySelector('.assistant-message:last-child');
                            
                            if (!assistantDiv || assistantDiv.classList.contains('loading-message')) {
                                assistantDiv = document.createElement('div');
                                assistantDiv.className = 'message assistant-message';
                                chatMessages.appendChild(assistantDiv);
                            }
                            
                            // 保留换行符，将文本转换为HTML
                            assistantDiv.innerHTML = assistantMessage
                                .replace(/\n/g, '<br>')
                                .replace(/ /g, '&nbsp;');
                            chatMessages.scrollTop = chatMessages.scrollHeight;
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

// 在初始化部分添加
loadHistory();
loadApiKeys();
initSidebarToggle(); 