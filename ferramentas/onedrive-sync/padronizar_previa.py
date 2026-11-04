# Prévia da padronização (mesmas regras do padronizar.ps1). NÃO move nada.
import os, re, sys, csv, json, unicodedata, datetime
BASE = os.path.expanduser('~/mnt/6 - Certificações')
TOPOS = ['3 - ANEXOS', '5 - REGISTROS']
LOTES = {
 'alta': ['AN 09','AN 101','AN 107','AN 109','AN 113','AN 115','AN 79','AN 82','AN 98','RG 002','RG 007','RG 011','RG 012','RG 030','RG 038','RG 044','RG 047','RG 049','RG 050','RG 056','RG CL 01'],
 'inverter': ['AN 06','AN 08','AN 114','AN 22','AN 71'],
 'media': ['AN 111','AN 116','AN 117','AN 12','AN 37','AN 58','AN 62','AN 68','AN 72','AN 77','AN 81','AN 83','AN 84','AN 85','AN 86','AN 88','AN 89','AN 92','AN 94','RG 004','RG 020','RG 021','RG 023','RG 042','RG 045','RG 052','RG 055'],
}
POR_FAZ = 'AN 06|AN 08|AN 10|AN 101|AN 113|AN 114|AN 115|AN 116|AN 117|AN 12|AN 19|AN 21|AN 22|AN 30|AN 37|AN 47|AN 51|AN 55|AN 56|AN 57|AN 58|AN 62|AN 68|AN 71|AN 72|AN 77|AN 81|AN 82|AN 83|AN 84|AN 86|AN 88|AN 89|AN 92|AN 94'.split('|')
NAO_MEXER = ['AN 19', 'AN 30']
def sa(s): return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
def ch(s): return re.sub(r'\s+', ' ', sa(s).upper()).strip()
def norm_cod(x):
    m = re.match(r'^([A-Z ]+?)\s*0*(\d+)$', ch(x)); return (m.group(1).strip() + ' ' + m.group(2)) if m else ch(x)
def cod_doc(nome): return norm_cod(nome.split(' - ')[0])
def fazenda(s):
    k = ch(s)
    if re.match(r'^((FAZ\.?|FAZENDA)\s*)?FACA$', k): return 'FAZ. FACA'
    if re.match(r'^((FAZ\.?|FAZENDA)\s*)?MORRO (DE )?BRANCO$', k): return 'FAZ. MORRO BRANCO'
    if re.match(r'^((FAZ\.?|FAZENDA)\s*)?TRES RIACHOS$', k): return 'FAZ. TRES RIACHOS'
    if re.match(r'^((FAZ\.?|FAZENDAS?)\s*)?(REUNIDAS )?QUEBRA COCAO$', k): return 'FAZ. REUNIDAS QUEBRA COCAO'
    if re.match(r'^LOTE ?35( ?-? ?PADAP)?$', k): return 'LOTE 35 PADAP'
    return None
def ano(s):
    k = ch(s)
    if re.match(r'^(19|20)\d\d$', k): return k
    m = re.match(r'^(COLHEITA|SAFRA|DEV\.?)\s*((19|20)\d\d)$', k)
    return m.group(2) if m else None
MESES = ['JANEIRO','FEVEREIRO','MARCO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO']
ABREV = [m[:3] for m in MESES]
def data_pasta(s, ano_ctx):
    k = ch(s)
    if k == 'FEVEVEIRO': k = 'FEVEREIRO'
    m = re.match(r'^(?:(?:CHECK LIST|MELHORIAS CONTINUAS)\s*-\s*)?(\d{1,2})-(\d{1,2})-((19|20)\d\d)$', k)
    if m: return '%s-%02d-%02d' % (m.group(3), int(m.group(2)), int(m.group(1)))
    m = re.match(r'^(\d{1,2})-((19|20)\d\d)$', k)
    if m: return '%s-%02d' % (m.group(2), int(m.group(1)))
    for i in range(12):
        if re.match(r'^(%s|%s)(\s*-?\s*(19|20)\d\d)?$' % (MESES[i], ABREV[i]), k):
            a = re.search(r'(19|20)\d\d', k); y = a.group(0) if a else ano_ctx
            if y: return '%s-%02d' % (y, i + 1)
    return None
def tem_data(nome):
    k = ch(os.path.splitext(nome)[0])
    if re.search(r'\d{1,2}[.\-_]\d{1,2}[.\-_](19|20)\d\d', k) or re.search(r'(19|20)\d\d[.\-_]\d{2}', k) or re.match(r'^\d{8}_\d{6}', k): return True
    if re.search(r'(^|[^\d])\d{1,2}-\d{1,2}([^\d]|$)', k): return True
    if any(re.search(r'(^|[^A-Z])%s([^A-Z]|$)' % x, k) for x in MESES): return True
    if any(re.search(r'(^|[^A-Z])%s[^A-Z0-9]{0,3}((19|20)?\d\d)' % x, k) for x in ABREV): return True
    return False
def ano_do_nome(nome):
    k = ch(nome)
    for pat in (r'(?:%s)[^A-Z0-9]{0,3}((19|20)\d\d)' % '|'.join(MESES + ABREV), r'\d{1,2}[.\-_]\d{1,2}[.\-_]((19|20)\d\d)', r'(?:^|\D)((19|20)\d\d)[.\-_]\d{2}[.\-_]\d{2}', r'^\d{4}((19|20)\d\d)_\d{6}'):
        m = re.search(pat, k)
        if m: return m.group(1)
    return None

lote = sys.argv[1]
alvos = [norm_cod(x) for x in LOTES[lote]]
porfaz = {norm_cod(x) for x in POR_FAZ}
plano, destinos = [], set()
for topo in TOPOS:
    raiz = os.path.join(BASE, topo)
    for pasta in sorted(os.listdir(raiz)):
        pfull = os.path.join(raiz, pasta)
        if not os.path.isdir(pfull): continue
        cod = cod_doc(pasta)
        if cod not in alvos or cod in [norm_cod(x) for x in NAO_MEXER]: continue
        pf = cod in porfaz
        for dp, dns, fns in os.walk(pfull):
            if re.search(r'[\\/](bkp|HIST[ÓO]RICO)([\\/]|$)', dp, re.I): continue
            for nome in fns:
                if nome.startswith('.') or nome.startswith('~$') or nome.lower() == 'desktop.ini': continue
                full = os.path.join(dp, nome)
                rel_doc = os.path.relpath(full, pfull)
                dirs = rel_doc.split(os.sep)[:-1]
                a = None; faz = None; prefixo = None; outros = []; mot = []
                for s in dirs:
                    y = ano(s)
                    if y: a = y
                for s in dirs:
                    if ano(s): continue
                    f = fazenda(s)
                    if f:
                        if pf and not faz:
                            faz = f
                            if f != s: mot.append('fazenda %s -> %s' % (s, f))
                            continue
                        if f != s: mot.append('fazenda %s -> %s' % (s, f))
                        outros.append(f); continue
                    d = data_pasta(s, a)
                    if d: prefixo = d; mot.append('tira a pasta de data "%s"' % s); continue
                    outros.append(s)
                if not a:
                    a = ano_do_nome(nome) or next((m.group(0) for s in reversed(dirs) for m in [re.search(r'(19|20)\d\d', s)] if m), None) or (prefixo[:4] if prefixo else None)
                    if not a: a = datetime.datetime.fromtimestamp(os.path.getmtime(full)).strftime('%Y')
                    mot.append('solto -> pasta %s' % a)
                novo_nome = ('%s - %s' % (prefixo, nome)) if prefixo and not tem_data(nome) else nome
                partes = [a] + ([faz] if faz else []) + outros + [novo_nome]
                novo = os.path.join(pfull, *partes)
                if novo == full: continue
                if pf and faz and not re.match(r'^(19|20)\d\d$', dirs[0] if dirs else ''): mot.append('ano antes da fazenda')
                if novo_nome != nome: mot.append('data no nome')
                if sum(1 for s in dirs if ano(s)) > 1: mot.append('pasta de ano repetida')
                if any(ano(s) and ano(s) != s for s in dirs): mot.append('"Colheita/Safra/DEV. AAAA" -> AAAA')
                if not mot: mot.append('ano logo abaixo do documento')
                k = novo.upper()
                conflito = os.path.exists(novo) or k in destinos
                destinos.add(k)
                plano.append({'doc': pasta.split(' - ')[0], 'de': os.path.relpath(full, BASE), 'para': os.path.relpath(novo, BASE),
                              'motivo': 'CONFLITO: já existe arquivo com esse nome no destino — fica onde está' if conflito else '; '.join(dict.fromkeys(mot))})
out = os.path.expanduser('~/mnt/LOP-Sync/padronizar-previa-%s.csv' % lote)
with open(out, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=['doc','de','para','motivo'], delimiter=';'); w.writeheader(); w.writerows(plano)
json.dump(plano, open(os.path.expanduser('~/pad/previa-%s.json' % lote), 'w'), ensure_ascii=False)
print(len(plano), 'mudam;', sum(1 for p in plano if p['motivo'].startswith('CONFLITO')), 'conflitos ->', out)
