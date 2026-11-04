import json, os, sys
BASE = os.path.expanduser('~/mnt/6 - Certificações')
MOV = os.path.expanduser('~/mnt/LOP-Sync/movidos.json')
plano = [x for x in json.load(open('previa-alta.json')) if not x['motivo'].startswith('CONFLITO')]
lock = os.path.expanduser('~/mnt/LOP-Sync/rodando.lock')
if os.path.exists(lock): print('sincronização rodando — pare'); sys.exit(1)
movidos = json.load(open(MOV, encoding='utf-8-sig')) if os.path.exists(MOV) else []
ok = err = 0; erros = []
docs = []
for x in plano:
    if x['doc'] not in docs: docs.append(x['doc'])
for d in docs:
    for x in [y for y in plano if y['doc'] == d]:
        de = os.path.join(BASE, x['de']); para = os.path.join(BASE, x['para'])
        try:
            if not os.path.exists(de): raise FileNotFoundError('origem sumiu')
            if os.path.exists(para): raise FileExistsError('destino existe')
            os.makedirs(os.path.dirname(para), exist_ok=True)
            os.rename(de, para)
            movidos.append({'de': 'onedrive:' + x['de'].replace(os.sep, '/'), 'para': 'onedrive:' + x['para'].replace(os.sep, '/')})
            ok += 1
        except Exception as e:
            err += 1; erros.append((x['de'], str(e)))
    with open(MOV, 'w', encoding='utf-8') as f: json.dump(movidos, f, ensure_ascii=False)
    print(d, 'ok')
print('movidos', ok, 'erros', err)
for e in erros[:20]: print(e)
