#!/usr/bin/env python3
"""
Merge freshly scraped Zuk and Topo Leilões data with existing Caixa data.
"""
import json
import re
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')

PRIORITY_NEIGHBORHOODS = [
    'Portão', 'Batel', 'Água Verde', 'Centro', 'Bigorrilho',
    'Cabral', 'Jardim Social', 'Alto da XV', 'Hugo Lange',
    'Juvevê', 'Rebouças', 'Cristo Rei', 'Boa Vista', 'Bacacheri', 'Tarumã'
]

def normalize(s):
    import unicodedata
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower().strip()

def is_priority(bairro):
    n = normalize(bairro)
    for p in PRIORITY_NEIGHBORHOODS:
        pn = normalize(p)
        if pn in n or n in pn:
            return True
    return False

# Load existing data
with open(os.path.join(DATA_DIR, '2026-02-09.json')) as f:
    existing = json.load(f)

existing_ids = {p['id'] for p in existing}

# New properties from fresh scraping
new_properties = []

# === ZUK CURITIBA (from web_fetch results) ===

# 1. Sala Comercial - Batel - R$300k (single price, no discount known)
# Already have zuk-215324 (SJP) and zuk-216690 (Alto Boqueirão)

zuk_fresh = [
    {
        "id": "zuk-217688",
        "tipo": "Sala Comercial",
        "bairro": "Batel",
        "endereco": "Avenida Sete de Setembro, 4848",
        "lance": 300000,
        "avaliacao": None,
        "desconto": None,
        "modalidade": "Leilão",
        "encerramento": "2026-02-09",
        "ocupacao": "desconhecido",
        "area": "51,32m² útil",
        "fonte": "Portal Zuk",
        "link": "https://www.portalzuk.com.br/imovel/pr/curitiba/batel/avenida-sete-de-setembro-4848/35312-217688",
        "prioridade": True
    },
    {
        "id": "zuk-216690",
        "tipo": "Casa",
        "bairro": "Alto Boqueirão",
        "endereco": "Rua Júlio Zandoná, 888",
        "lance": 341800.09,
        "avaliacao": 683600.17,
        "desconto": 50,
        "modalidade": "Leilão 2ª Praça",
        "encerramento": "2026-02-19",
        "ocupacao": "desconhecido",
        "area": None,
        "fonte": "Portal Zuk",
        "link": "https://www.portalzuk.com.br/imovel/pr/curitiba/alto-boqueirao/rua-julio-zandona-888/35174-216690",
        "prioridade": False
    },
    {
        "id": "zuk-218515",
        "tipo": "Apartamento",
        "bairro": "Uberaba",
        "endereco": "Rua Augusto Zibarth, 1220",
        "lance": 288000,
        "avaliacao": None,
        "desconto": None,
        "modalidade": "Lance Inicial",
        "encerramento": "2026-03-03",
        "ocupacao": "desconhecido",
        "area": "66,00m² útil",
        "fonte": "Portal Zuk",
        "link": "https://www.portalzuk.com.br/imovel/pr/curitiba/uberaba/rua-augusto-zibarth-1220/35447-218515",
        "prioridade": False
    },
    {
        "id": "zuk-218609",
        "tipo": "Casa",
        "bairro": "Alto",
        "endereco": "Rua José Veríssimo, 1614",
        "lance": 750000,
        "avaliacao": None,
        "desconto": None,
        "modalidade": "Lance Inicial",
        "encerramento": "2026-03-03",
        "ocupacao": "desconhecido",
        "area": "230,00m² construída",
        "fonte": "Portal Zuk",
        "link": "https://www.portalzuk.com.br/imovel/pr/curitiba/alto/rua-jose-verissimo-1614/35447-218609",
        "prioridade": False
    },
    {
        "id": "zuk-218643",
        "tipo": "Apartamento",
        "bairro": "Pinheirinho",
        "endereco": "Rua Rogério Xavier Rocha Loures, 57",
        "lance": 265000,
        "avaliacao": None,
        "desconto": None,
        "modalidade": "Lance Inicial",
        "encerramento": "2026-03-03",
        "ocupacao": "desocupado",
        "area": "48,00m² útil",
        "fonte": "Portal Zuk",
        "link": "https://www.portalzuk.com.br/imovel/pr/curitiba/pinheirinho/rua-rogerio-xavier-rocha-loures-57/35447-218643",
        "prioridade": False
    },
    {
        "id": "zuk-218925",
        "tipo": "Casa",
        "bairro": "Alto",
        "endereco": "Rua Sebastião Alves Ferreira, 2294",
        "lance": 429400,
        "avaliacao": None,
        "desconto": None,
        "modalidade": "Lance Inicial",
        "encerramento": "2026-03-03",
        "ocupacao": "desconhecido",
        "area": "112,00m² construída",
        "fonte": "Portal Zuk",
        "link": "https://www.portalzuk.com.br/imovel/pr/curitiba/alto/rua-sebastiao-alves-ferreira-2294/35447-218925",
        "prioridade": False
    },
    {
        "id": "zuk-218442",
        "tipo": "Apartamento",
        "bairro": "Capão da Imbuia",
        "endereco": "Rua Clavio Molinari, 1327",
        "lance": 132800,
        "avaliacao": None,
        "desconto": None,
        "modalidade": "Leilão",
        "encerramento": "2026-03-12",
        "ocupacao": "desconhecido",
        "area": "36,40m² útil",
        "fonte": "Portal Zuk",
        "link": "https://www.portalzuk.com.br/imovel/pr/curitiba/capao-da-imbuia/rua-clavio-molinari-1327/35444-218442",
        "prioridade": False
    },
]

# === TOPO LEILOES (Curitiba only, matching filters) ===

topo_fresh = [
    {
        "id": "topo-32506",
        "tipo": "Casa",
        "bairro": "Cajuru",
        "endereco": "Rua Dr. Petronio Romero de Souza, 227 - Cajuru - Curitiba/PR",
        "lance": 222541.54,
        "avaliacao": 445083.07,
        "desconto": 50,
        "modalidade": "Leilão 2ª Praça",
        "encerramento": "2026-02-24",
        "ocupacao": "desconhecido",
        "area": None,
        "fonte": "Topo Leilões",
        "link": "https://topoleiloes.com.br/lote/32506/casa-rua-dr-petronio-romero-de-souza-227-cajuru-curitibapr",
        "prioridade": False
    },
    {
        "id": "topo-32480",
        "tipo": "Vaga de Garagem",
        "bairro": "Ahú",
        "endereco": "Rua Gabriela Mistral, 149 - Ed. Pontevedra - Ahú - Curitiba/PR",
        "lance": 21639.34,
        "avaliacao": 43278.68,
        "desconto": 50,
        "modalidade": "Leilão 2ª Praça",
        "encerramento": "2026-02-13",
        "ocupacao": "desconhecido",
        "area": None,
        "fonte": "Topo Leilões",
        "link": "https://topoleiloes.com.br/lote/32480/vaga-de-garagem-no-29-edificio-pontevedra-rua-gabriela-mistral-149-ahu-curitibapr",
        "prioridade": False
    },
]

# Merge: add fresh Zuk and Topo, avoiding duplicates
for prop in zuk_fresh + topo_fresh:
    if prop['id'] not in existing_ids:
        prop['prioridade'] = is_priority(prop['bairro'])
        prop['novo'] = True
        new_properties.append(prop)
        existing_ids.add(prop['id'])
        print(f"  + Added {prop['id']}: {prop['tipo']} - {prop['bairro']} - R${prop['lance']:,.0f}")
    else:
        # Update existing entry if needed
        for ep in existing:
            if ep['id'] == prop['id']:
                # Update fields that may have changed
                if prop.get('encerramento') and not ep.get('encerramento'):
                    ep['encerramento'] = prop['encerramento']
                if prop.get('ocupacao') != 'desconhecido' and ep.get('ocupacao') == 'desconhecido':
                    ep['ocupacao'] = prop['ocupacao']
                print(f"  ~ Updated {prop['id']}")
                break

# Combine all properties
all_properties = existing + new_properties

# Filter: >40% discount and <R$800k (but keep items with unknown discount if price is good)
filtered = []
for p in all_properties:
    if p.get('lance', 999999) > 800000:
        continue
    disc = p.get('desconto') or 0
    if disc >= 40 or p.get('avaliacao') is None:
        # Keep properties with >40% discount, OR those where we can't calculate discount
        filtered.append(p)

# Sort: priority neighborhoods first, then by score (if available), then by discount
def sort_key(p):
    prio = 0 if p.get('prioridade') else 1
    score = -(p.get('score') or 0)
    disc = -(p.get('desconto') or 0)
    return (prio, score, disc)

filtered.sort(key=sort_key)

print(f"\nTotal: {len(filtered)} properties ({len(new_properties)} new)")
print(f"Sources: {len([p for p in filtered if p['fonte']=='Caixa Econômica'])} Caixa, "
      f"{len([p for p in filtered if p['fonte']=='Portal Zuk'])} Zuk, "
      f"{len([p for p in filtered if p['fonte']=='Topo Leilões'])} Topo")

# Save
output_file = os.path.join(DATA_DIR, '2026-02-09.json')
with open(output_file, 'w') as f:
    json.dump(filtered, f, indent=2, ensure_ascii=False)
print(f"Saved to {output_file}")
