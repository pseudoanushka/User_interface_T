from flask import Flask, render_template,send_from_directory,jsonify
from flask_cors import CORS
import os
import threading
import listen

app = Flask(__name__, static_folder="frontend/dist/assets", static_url_path="/assets", template_folder="frontend/dist")
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

@app.route('/vite.svg')
def serve_vite_svg():
    return send_from_directory('frontend/dist', 'vite.svg')

@app.route('/static/js/script.js')
def script():
    return "Not Found", 404

@app.route("/telemetry")
def telemetry():
    return jsonify(listen.get_data())

@app.route('/static/css/styles.css')
def styles():
    return send_from_directory('static/css','styles.css')

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True, use_reloader=False)

