"""Build Malapit's static address lists from the pinned public PSGC snapshots.

Inputs are data only; no downloaded scripts are executed. See
docs/listing-location-data.md for source URLs, versions, licences and refresh steps.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-zip', type=Path, required=True)
parser.add_argument('--metadata-dir', type=Path, required=True)
parser.add_argument('--output', type=Path, default=Path('public/locations'))
args = parser.parse_args()

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')

def point(value):
    if isinstance(value, list) and len(value) == 2 and all(isinstance(n, (int, float)) for n in value) and 4.5 <= value[0] <= 21.5 and 116 <= value[1] <= 127:
        return value
    return None

def friendly_city(name, region):
    if name.startswith('City of '):
        name = name[8:]
        if region != '1300000000':
            name += ' City'
    if region == '1300000000' and name.endswith(' City') and name != 'Quezon City':
        name = name[:-5]
    return name

metadata = {}
for number in range(1, 5):
    page = json.loads((args.metadata_dir / f'cities-{number}.json').read_text())
    assert page['meta']['total'] == 1642
    for city in page['data']:
        assert city['code'] not in metadata
        metadata[city['code']] = city
assert len(metadata) == 1642

cities, groups, barangay_codes, patches = [], {}, set(), []
with zipfile.ZipFile(args.source_zip) as archive:
    base = archive.namelist()[0]
    index = json.loads(archive.read(base + 'psgc/index.json'))
    assert index['published'] == '30 June 2026'
    province_names = {p['code']: p['name'] for r in index['regions'] for p in r['provinces']}
    region_names = {r['code']: r['name'] for r in index['regions']}
    province_names['1300000000'] = 'Metro Manila'
    for filename in sorted(archive.namelist()):
        if not filename.startswith(base + 'psgc/areas/') or not filename.endswith('.json'):
            continue
        area = json.loads(archive.read(filename))
        points = json.loads(archive.read(base + f"psgc/points/{area['code']}.json"))
        area_cities = {}
        for city in area['cities']:
            current = metadata[city['code']]
            assert len(city['barangays']) == current['barangayCount']
            group_code = current['geographicProvinceCode'] or current['provinceCode'] or current['specialAreaCode'] or current['regionCode']
            group_name = province_names.get(group_code) or (area['name'] if area['kind'] == 'province' else region_names[current['regionCode']])
            groups[group_code] = group_name
            name = friendly_city(current['name'], current['regionCode'])
            label = f'{name}, {group_name}'
            assert len(label) <= 80, label
            entry = {'code': city['code'], 'name': name, 'officialName': current['name'], 'provinceCode': group_code, 'provinceName': group_name, 'label': label, 'areaCode': area['code']}
            center = point(points['c'].get(city['code']))
            if center:
                entry['point'] = center
            cities.append(entry)
            barangays = []
            for raw in city['barangays']:
                code, barangay_name = raw[:2]
                assert code not in barangay_codes
                barangay_codes.add(code)
                # PSA's only Q3 2026 name change, independently checked against
                # its 12 October 2026 release, reference 2026-331.
                if current['name'] == 'Cabanglasan' and barangay_name == 'Lambangan':
                    barangay_name = 'Lambagan'
                    patches.append(code)
                barangay = {'code': code, 'name': barangay_name}
                if len(raw) > 2:
                    barangay['district'] = raw[2]
                center = point(points['b'].get(code))
                if center:
                    barangay['point'] = center
                barangays.append(barangay)
            area_cities[city['code']] = sorted(barangays, key=lambda b: b['name'].casefold())
        write_json(args.output / 'areas' / f"{area['code']}.json", {'code': area['code'], 'cities': area_cities})
    licence = archive.read(base + 'licenses/philippines-json-maps-MIT.txt').rstrip(b'\r\n') + b'\n'
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'map-points-MIT.txt').write_bytes(licence)

assert len(cities) == 1642
assert len(barangay_codes) == 42010
assert len(patches) == 1
cities.sort(key=lambda c: (c['name'].casefold(), c['provinceName'].casefold()))
write_json(args.output / 'index.json', {'version': '2026-Q3', 'provinces': sorted([{'code': code, 'name': name} for code, name in groups.items()], key=lambda p: p['name'].casefold()), 'cities': cities})
write_json(args.output / 'sources.json', {
    'namesSource': 'Philippine Statistics Authority, Philippine Standard Geographic Code',
    'namesAsOf': '2026-09-30',
    'namesSourceUrl': 'https://psa.gov.ph/classification/psgc',
    'namesLicence': 'https://creativecommons.org/licenses/by/4.0/',
    'baseSnapshot': 'https://github.com/Tenasia/ph-psgc/tree/2026-Q2',
    'baseSnapshotSha256': hashlib.sha256(args.source_zip.read_bytes()).hexdigest(),
    'q3Correction': {'reference': '2026-331', 'code': patches[0], 'old': 'Lambangan', 'new': 'Lambagan'},
    'cityMetadata': 'https://psgc.billyjamesramos.com/docs',
    'mapPointsSource': 'https://github.com/faeldon/philippines-json-maps',
    'mapPointsSnapshot': 'PSA/NAMRIA administrative boundaries, PSGC 4Q 2023, processed by Tenasia/ph-psgc',
    'mapPointsLicence': '/locations/map-points-MIT.txt',
    'note': 'Map points are area hints. Owners explicitly place their property pin; area hints do not confirm a property address.'
})
print(json.dumps({'cities': len(cities), 'barangays': len(barangay_codes), 'provinceOrAreaGroups': len(groups), 'q3CorrectionCode': patches[0], 'citiesWithoutPoint': sum('point' not in c for c in cities)}))
