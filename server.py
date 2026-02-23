from flask import Flask, render_template,send_from_directory,jsonify
from flask_cors import CORS
import os
import threading
import listen

app = Flask(__name__)
CORS(app)  # Enable CORS for the frontend to access the API
PARAMS_DIR = os.path.join("public", "params")
# start telemetry thread
threading.Thread(target=listen.main, daemon=True).start()
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/public/params/<filename>')
def serve_param(filename):
    return send_from_directory(PARAMS_DIR,filename)

@app.route('/static/js/script.js')
def script():
    return send_from_directory('static.js','script.js')

@app.route("/telemetry")
def telemetry():
    return jsonify(listen.get_data())

@app.route('/static/css/styles.css')
def styles():
    return send_from_directory('static/css','styles.css')

if __name__ == "__main__":
    app.run(host="0.0.0.0",port=8000,debug=True)

