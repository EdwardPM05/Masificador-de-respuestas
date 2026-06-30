import requests
import random
import time

URL = "https://docs.google.com/forms/d/e/1FAIpQLSd9ReBr_C2_nzr-FRczE0obhp1cGgK_N54NWwz0et4wnOhyzw/formResponse"

REMITENTES = ["a", "b", "c", "d"]

OPCIONES = [
    "Totalmente en desacuerdo",
    "En desacuerdo",
    "Ni de acuerdo ni en desacuerdo",
    "De acuerdo",
    "Totalmente De acuerdo",
]

# Las 4 preguntas Likert
PREGUNTAS = [
    "entry.1806734883",  # 1 - ¿Me siento vacío en mi vida emocionalmente?
    "entry.341699438",   # 2 - ¿Siento que me falta compañía en mi vida diaria?
    "entry.1961646522",  # 3 - ¿Me siento solo(a) incluso cuando estoy con otras personas?
    "entry.2017480327",  # 4 - ¿Necesito más apoyo emocional del que recibo?
]

def enviar_respuesta():
    remitente = random.choice(REMITENTES)
    respuestas = [random.choice(OPCIONES) for _ in range(4)]

    data = {
        "entry.1901432012": remitente,
        "fvv": "1",
        "pageHistory": "0",
    }
    for entry_id, respuesta in zip(PREGUNTAS, respuestas):
        data[entry_id] = respuesta

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://docs.google.com/forms/d/e/1FAIpQLSd9ReBr_C2_nzr-FRczE0obhp1cGgK_N54NWwz0et4wnOhyzw/viewform",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }

    r = requests.post(URL, data=data, headers=headers)
    return r.status_code, remitente, respuestas


def enviar_masivo(cantidad=10, delay=0.5):
    print(f"Enviando {cantidad} respuestas aleatorias...\n")
    exitos = 0
    for i in range(1, cantidad + 1):
        status, remitente, respuestas = enviar_respuesta()
        if status == 200:
            exitos += 1
            print(f"[{i}/{cantidad}] ✓ OK | Remitente: {remitente} | R1: {respuestas[0][:15]}...")
        else:
            print(f"[{i}/{cantidad}] ✗ Error (HTTP {status})")
        if i < cantidad:
            time.sleep(delay)
    print(f"\nCompletado: {exitos}/{cantidad} enviados correctamente.")


if __name__ == "__main__":
    enviar_masivo(
        cantidad=10,   # cuántas respuestas enviar
        delay=0.5,     # segundos entre envíos
    )