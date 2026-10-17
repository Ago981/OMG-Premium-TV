/** Esempio di script resolver offerto dal pulsante "Crea template". */
export const RESOLVER_TEMPLATE = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# Python Resolver per OMG TV
# Questo script riceve un URL e restituisce l'URL risolto

import sys
import json
import os
import requests
import time
from urllib.parse import urlparse, parse_qs

# Configurazione globale
API_KEY = "la_tua_api_key"
API_SECRET = "il_tuo_secret"
RESOLVER_VERSION = "1.0.0"

def get_token():
    """
    Esempio di funzione per ottenere un token di autenticazione
    """
    # Implementazione personalizzata per ottenere il token
    # Questa è solo una simulazione
    token = f"token_{int(time.time())}"
    return token

def resolve_link(url, headers=None, channel_name=None):
    """
    Funzione principale che risolve un link
    Parametri:
    - url: URL da risolvere
    - headers: dizionario con gli header HTTP da utilizzare 
    - channel_name: nome del canale per il logging
    
    Restituisce:
    - Un dizionario con l'URL risolto e gli header da utilizzare
    """
    print(f"Risoluzione URL: {url}")
    print(f"Canale: {channel_name}")
    
    # Parsing dell'URL per estrarre parametri
    parsed_url = urlparse(url)
    params = parse_qs(parsed_url.query)
    
    # Esempio: aggiungi un token all'URL
    token = get_token()
    
    # ESEMPIO 1: Aggiungi token a URL esistente
    if parsed_url.netloc == "example.com":
        resolved_url = f"{url}&token={token}"
    
    # ESEMPIO 2: Chiama API e ottieni URL reale
    elif "api" in parsed_url.netloc:
        try:
            api_response = requests.get(
                f"https://api.example.com/resolve",
                params={"url": url, "key": API_KEY},
                headers=headers
            )
            if api_response.status_code == 200:
                data = api_response.json()
                resolved_url = data.get("stream_url", url)
            else:
                print(f"Errore API: {api_response.status_code}")
                resolved_url = url
        except Exception as e:
            print(f"Errore chiamata API: {str(e)}")
            resolved_url = url
    
    # Caso predefinito: restituisci l'URL originale
    else:
        resolved_url = url
    
    # Aggiungi o modifica gli header
    final_headers = headers.copy() if headers else {}
    
    # Puoi aggiungere header specifici
    final_headers["User-Agent"] = final_headers.get("User-Agent", "Mozilla/5.0")
    final_headers["Authorization"] = f"Bearer {token}"
    
    # Restituisci il risultato
    return {
        "resolved_url": resolved_url,
        "headers": final_headers
    }

def main():
    """
    Funzione principale che gestisce i parametri di input
    """
    # Verifica parametri di input
    if len(sys.argv) < 2:
        print("Utilizzo: python3 resolver.py [--check|--resolve input_file output_file]")
        sys.exit(1)
    
    # Comando check: verifica che lo script sia valido
    if sys.argv[1] == "--check":
        print("resolver_ready: True")
        sys.exit(0)
    
    # Comando resolve: risolvi un URL
    if sys.argv[1] == "--resolve" and len(sys.argv) >= 4:
        input_file = sys.argv[2]
        output_file = sys.argv[3]
        
        try:
            # Leggi i parametri di input
            with open(input_file, 'r') as f:
                input_data = json.load(f)
            
            url = input_data.get('url', '')
            headers = input_data.get('headers', {})
            channel_name = input_data.get('channel_name', 'unknown')
            
            # Risolvi l'URL
            result = resolve_link(url, headers, channel_name)
            
            # Scrivi il risultato
            with open(output_file, 'w') as f:
                json.dump(result, f, indent=2)
            
            print(f"URL risolto salvato in: {output_file}")
            sys.exit(0)
        except Exception as e:
            print(f"Errore: {str(e)}")
            sys.exit(1)
    
    print("Comando non valido")
    sys.exit(1)

if __name__ == "__main__":
    main()
`;
