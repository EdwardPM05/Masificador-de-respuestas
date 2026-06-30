import requests
import random
import time

URL = "https://docs.google.com/forms/d/e/1FAIpQLSeif9i5OGKXkMWgDKwZGzHIgBNCOeHyNulkADz1JCatGIxvfQ/formResponse"

REMITENTES = ["Camila", "Roxel", "Diogo", "Hansel", "Ventura"]

OPCIONES = [
    "Totalmente en desacuerdo",
    "En desacuerdo",
    "Ni de acuerdo ni en desacuerdo",
    "De acuerdo",
    "Totalmente de acuerdo",
]

# IDs de las 20 preguntas (en orden)
PREGUNTAS = [
    "entry.1276392697",
    "entry.945332514",
    "entry.811820967",
    "entry.2031678298",
    "entry.2137228405",
    "entry.1625439682",
    "entry.733938405",
    "entry.2021365610",
    "entry.1186624314",
    "entry.1895879017",
    "entry.523623290",
    "entry.125393239",
    "entry.740664726",
    "entry.672954258",
    "entry.1902118474",
    "entry.408389560",
    "entry.1721642345",
    "entry.1124007994",
    "entry.1361134213",
    "entry.1803001747",
]

def enviar_respuesta(remitente=None, respuestas=None):
    """
    remitente: uno de REMITENTES, o None para aleatorio
    respuestas: lista de 20 strings con las opciones, o None para aleatorio
    """
    if remitente is None:
        remitente = random.choice(REMITENTES)
    if respuestas is None:
        respuestas = [random.choice(OPCIONES) for _ in range(20)]

    data = {
        "entry.513669972": "",         # campo vacío inicial
        "entry.1212348438": remitente, # ¿Quién te envió el formulario?
        "fvv": "1",
        "pageHistory": "0",
    }

    for entry_id, respuesta in zip(PREGUNTAS, respuestas):
        data[entry_id] = respuesta

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://docs.google.com/forms/d/e/1FAIpQLSeif9i5OGKXkMWgDKwZGzHIgBNCOeHyNulkADz1JCatGIxvfQ/viewform",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }

    r = requests.post(URL, data=data, headers=headers)
    return r.status_code


def enviar_masivo(cantidad=10, remitente_fijo=None, delay=1.0, respuestas_fijas=None):
    """
    cantidad: cuántos envíos hacer
    remitente_fijo: si quieres fijar uno (ej: "Ventura"), o None para aleatorio
    delay: segundos entre envíos (evita bloqueo)
    respuestas_fijas: lista de 20 strings, o None para aleatorio
    """
    print(f"Enviando {cantidad} respuestas...\n")
    exitos = 0
    for i in range(1, cantidad + 1):
        status = enviar_respuesta(remitente=remitente_fijo, respuestas=respuestas_fijas)
        if status == 200:
            exitos += 1
            print(f"[{i}/{cantidad}] ✓ OK")
        else:
            print(f"[{i}/{cantidad}] ✗ Error (HTTP {status})")
        if i < cantidad:
            time.sleep(delay)
    print(f"\nCompletado: {exitos}/{cantidad} enviados correctamente.")


# ── CONFIGURACIÓN ──────────────────────────────────────────────
if __name__ == "__main__":
    respuestas_fijas = ["Ni de acuerdo ni en desacuerdo"] * 20

    enviar_masivo(
        cantidad=7,
        remitente_fijo="Ventura",
        delay=0.5,
        respuestas_fijas=respuestas_fijas,
    )