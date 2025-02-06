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

def load_chat_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_chat_history(history):
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
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
            "messages": messages,
            "stream": stream,
            "max_tokens": 100000
        }
        
        response = requests.post(url, json=payload, headers=headers, stream=stream)
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
        api_key = data.get('api_key', 'key1')  # 默认使用 key1
        
        # 确保消息是 raw string
        message = r"{}".format(message)
        
        # 加载历史对话
        chat_history = load_chat_history()
        
        # 如果是新会话，创建新的session_id
        if not session_id:
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
        save_chat_history(chat_history)  # 立即保存用户消息
        
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
                
                for line in response.iter_lines():
                    if line:
                        try:
                            json_response = json.loads(line.decode('utf-8').replace('data: ', ''))
                            if json_response.get('choices'):
                                content = json_response['choices'][0]['delta'].get('content', '')
                                if content:
                                    assistant_message['content'] += content
                                    yield f"data: {json.dumps({'content': content})}\n\n"
                        except Exception as e:
                            print(f"Error processing response: {e}")
                            yield f"data: {json.dumps({'content': '处理响应时出错'})}\n\n"
                            continue
                
                # 保存助手回复
                chat_history[session_id]['messages'].append(assistant_message)
                save_chat_history(chat_history)
                
            except Exception as e:
                print(f"Error in generate: {e}")
                yield f"data: {json.dumps({'content': '生成响应时出错'})}\n\n"
        
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

if __name__ == '__main__':
    app.run(debug=True) 