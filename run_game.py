import http.server
import socketserver
import ssl
import webbrowser
from pathlib import Path

# Listen on all network interfaces so other devices on the LAN can connect.
HOST = "0.0.0.0"
LAN_IP = "192.168.1.4"
PORT = 8000
GAME_FILE = "index.html"

# Place localhost-cert.pem and localhost-key.pem next to this script.
project_dir = Path(__file__).resolve().parent
cert_file = project_dir / "localhost-cert.pem"
key_file = project_dir / "localhost-key.pem"


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(project_dir), **kwargs)


def main():
    missing = [path.name for path in (cert_file, key_file) if not path.is_file()]
    if missing:
        names = " and ".join(missing)
        raise FileNotFoundError(
            f"Missing {names}. Extract both certificate files from "
            "megu_https_certificate.zip into the same folder as run_game.py."
        )

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(cert_file), keyfile=str(key_file))
    server.socket = context.wrap_socket(server.socket, server_side=True)

    url = f"https://{LAN_IP}:{PORT}/{GAME_FILE}"
    print(f"Launching game at {url}")
    print(f"This computer can also use https://localhost:{PORT}/{GAME_FILE}")
    print("For other devices, make sure they are on the same Wi-Fi/LAN.")
    print("Allow Python through the firewall for private networks if prompted.")
    print("Keep this window open while playing. Press Ctrl+C to stop the server.")
    webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nGame server stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
