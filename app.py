from flask import Flask, render_template, request, jsonify, Response, stream_with_context
import json
import os
from datetime import datetime
import requests
import uuid
# from dotenv import load_dotenv

# 加载环境变量
# load_dotenv()

app = Flask(__name__)

# 加载配置文件
def load_config():
    try:
        with open('config.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        # 如果配置文件不存在，返回默认配置
        return {
            "api_keys": {
                "key1": {
                    "name": "DeepSeek-1",
                    "key": ""
                }
            }
        }

# 获取配置
config = load_config()
API_KEYS = config['api_keys']

# 存储对话历史的文件路径
HISTORY_FILE = 'chat_history.json'

# 存储备份历史的文件路径
BACKUP_FILE = 'chat_backup.json'

def load_chat_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_chat_history(history):
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=4)

def load_backup_history():
    if os.path.exists(BACKUP_FILE):
        with open(BACKUP_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_backup_history(history):
    with open(BACKUP_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=4)

def clean_markdown(text):
    # 去掉多余的换行符和空段落
    cleaned_text = "\n".join([line.strip() for line in text.splitlines() if line.strip()])
    return cleaned_text

def send_message_to_chat(messages, api_key='key1', stream=True):
    try:
        url = 'https://cloud.luchentech.com/api/maas/chat/completions'
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {API_KEYS[api_key]["key"]}'
        }
        
        payload = {
            "model": "deepseek_r1",
            "messages": messages[-3:],
            "stream": stream,
            "max_tokens": 100000
        }

        print(f"Sending request with payload: {json.dumps(payload, ensure_ascii=False)}")
        print(f"Using headers: {headers}")
        
        response = requests.post(url, json=payload, headers=headers, stream=stream)
        print(f"Response status: {response.status_code}")
        
        if response.status_code != 200:
            error_data = response.json()
            error_message = error_data.get('error', {}).get('message', '未知错误')
            raise Exception(f"API请求失败: {error_message}")
        return response
    except requests.exceptions.RequestException as e:
        raise Exception(f"网络请求错误: {str(e)}")
    except Exception as e:
        raise Exception(f"发送消息时出错: {str(e)}")

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/keys')
def get_api_keys():
    # 只返回名称和 ID，不返回实际的 key
    return jsonify({
        key: {'name': info['name']} 
        for key, info in API_KEYS.items() 
        if info['key']  # 只返回有效的 API key
    })

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        session_id = data.get('session_id')
        message = data.get('message')
        api_key = data.get('api_key', 'key1')
        
        print(f"\nNew chat request:")
        print(f"Session ID: {session_id}")
        print(f"API Key: {api_key}")
        
        # 加载历史对话
        chat_history = load_chat_history()
        
        if session_id not in chat_history:
            session_id = str(uuid.uuid4())
            chat_history[session_id] = {
                'title': message[:20] + '...',
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'messages': []
            }
        
        # 添加用户消息
        chat_history[session_id]['messages'].append({
            'role': 'user',
            'content': message
        })
        
        print(f"Current messages in session:")
        for msg in chat_history[session_id]['messages']:
            print(f"- {msg['role']}: {msg['content'][:50]}...")
        
        save_chat_history(chat_history)
        
        def generate():
            try:
                response = send_message_to_chat(
                    chat_history[session_id]['messages'],
                    api_key=api_key,
                    stream=True
                )
                
                if response.status_code != 200:
                    yield f"data: {json.dumps({'content': '请求失败: ' + str(response.status_code)})}\n\n"
                    return
                
                assistant_message = {'role': 'assistant', 'content': ''}
                current_reasoning = ''
                
                for line in response.iter_lines():
                    if line:
                        line_text = line.decode('utf-8')
                        print(f"Raw response line: {line_text}")
                        
                        try:
                            if line_text.startswith('data: '):
                                json_response = json.loads(line_text.replace('data: ', ''))
                                if json_response.get('choices'):
                                    delta = json_response['choices'][0]['delta']
                                    
                                    # 处理 reasoning_content
                                    reasoning_content = delta.get('reasoning_content', '')
                                    if reasoning_content:
                                        current_reasoning += reasoning_content
                                        yield f"data: {json.dumps({'reasoning_content': current_reasoning})}\n\n"
                                    
                                    # 处理正常的 content
                                    content = delta.get('content', '')
                                    if content:
                                        assistant_message['content'] += content
                                        yield f"data: {json.dumps({'content': content})}\n\n"
                        except json.JSONDecodeError as e:
                            print(f"JSON decode error: {e}")
                            print(f"Problematic line: {line_text}")
                            continue
                        except Exception as e:
                            print(f"Error processing line: {e}")
                            print(f"Problematic line: {line_text}")
                            continue
                
                if assistant_message['content']:
                    chat_history[session_id]['messages'].append(assistant_message)
                    save_chat_history(chat_history)
                    print("Chat history updated with assistant response")
                else:
                    print("Warning: Empty assistant response")
                
            except Exception as e:
                print(f"Error in generate: {e}")
                yield f"data: {json.dumps({'content': f'生成响应时出错: {str(e)}'})}\n\n"
        
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
        
    except Exception as e:
        print(f"Error in chat route: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/history', methods=['GET'])
def get_history():
    chat_history = load_chat_history()
    return jsonify(chat_history)

@app.route('/api/session/<session_id>', methods=['GET'])
def get_session(session_id):
    chat_history = load_chat_history()
    if session_id in chat_history:
        return jsonify(chat_history[session_id])
    return jsonify({'error': 'Session not found'}), 404

@app.route('/api/session/<session_id>/title', methods=['PUT'])
def update_session_title(session_id):
    try:
        data = request.json
        new_title = data.get('title')
        
        if not new_title:
            return jsonify({'error': 'Title is required'}), 400
            
        chat_history = load_chat_history()
        if session_id not in chat_history:
            return jsonify({'error': 'Session not found'}), 404
            
        chat_history[session_id]['title'] = new_title
        save_chat_history(chat_history)
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error updating session title: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/undo', methods=['POST'])
def undo_last_message():
    try:
        data = request.json
        session_id = data.get('session_id')
        
        if not session_id:
            return jsonify({'error': 'Session ID is required'}), 400
            
        chat_history = load_chat_history()
        backup_history = load_backup_history()
        
        if session_id not in chat_history:
            return jsonify({'error': 'Session not found'}), 404
            
        # 确保至少有一组对话可以撤销
        if len(chat_history[session_id]['messages']) < 2:
            return jsonify({'error': 'No messages to undo'}), 400
            
        # 移除最后一组对话（用户消息和助手回复）
        user_message = chat_history[session_id]['messages'].pop()
        assistant_message = chat_history[session_id]['messages'].pop()
        
        # 保存到备份文件
        if session_id not in backup_history:
            backup_history[session_id] = {
                'title': chat_history[session_id]['title'],
                'timestamp': chat_history[session_id]['timestamp'],
                'messages': []
            }
        
        backup_history[session_id]['messages'].extend([assistant_message, user_message])
        
        save_chat_history(chat_history)
        save_backup_history(backup_history)
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"Error in undo: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/sync', methods=['POST'])
def sync_backup():
    try:
        data = request.json
        session_id = data.get('session_id')
        
        if not session_id:
            return jsonify({'error': 'Session ID is required'}), 400
            
        chat_history = load_chat_history()
        backup_history = load_backup_history()
        
        if session_id not in backup_history or not backup_history[session_id]['messages']:
            return jsonify({'error': 'No backup messages found'}), 404
            
        # 恢复所有备份的消息
        if session_id not in chat_history:
            chat_history[session_id] = {
                'title': backup_history[session_id]['title'],
                'timestamp': backup_history[session_id]['timestamp'],
                'messages': []
            }
            
        chat_history[session_id]['messages'].extend(backup_history[session_id]['messages'])
        backup_history[session_id]['messages'] = []  # 清空备份
        
        save_chat_history(chat_history)
        save_backup_history(backup_history)
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"Error in sync: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 