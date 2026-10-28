import http.server
import socketserver
import webbrowser
import socket

PORT = 8080

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    local_ip = get_local_ip()
    print("======================================================")
    print("   SERWER GRY BRAND NEW WORLD v1.5 URUCHOMIONY!")
    print("======================================================")
    print(f"1. Twój adres lokalny: http://localhost:{PORT}")
    print(f"2. Adres w sieci Wi-Fi/LAN: http://{local_ip}:{PORT}")
    print("------------------------------------------------------")
    print("Aby wygenerować publiczny LINK dla znajomych z Internetu,")
    print("wpisz w drugim oknie wiersza poleceń (CMD):")
    print(f"   ssh -p 443 -R0:localhost:{PORT} a.pinggy.io")
    print("======================================================")
    webbrowser.open(f"http://localhost:{PORT}")
    with socketserver.TCPServer(("", PORT), QuietHandler) as httpd:
        httpd.serve_forever()
