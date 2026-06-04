# 번들 지리 데이터 출처 (provenance)

모든 데이터는 공개 데이터셋에서 받아 가공한 것이며, 수기로 만든 좌표는 없다.

## 행정구역 경계 (regions.*.json)

admin-1 폴리곤. mapshaper로 단순화(3~5%) 후 `{id, country, name, nameLocal}`로 변환.
`id`는 `KR-11`처럼 국가코드 + 원본 행정코드.

| 국가 | 원본 | 라이선스 |
|---|---|---|
| 🇯🇵 JP | [dataofjapan/land](https://github.com/dataofjapan/land) `japan.geojson` (JIS 현 코드) | 원본 라이선스 확인 |
| 🇰🇷 KR | [southkorea/southkorea-maps](https://github.com/southkorea/southkorea-maps) KOSTAT 2018 시·도 | 원본 라이선스 확인 |
| 🇹🇭 TH | [chingchai/OpenGISData-Thailand](https://github.com/chingchai/OpenGISData-Thailand) provinces | 원본 라이선스 확인 |

## 도시 포인트 (cities.*.json)

[**GeoNames**](https://www.geonames.org/) `cities15000` 에서 추출.
- feature code `PPLC`/`PPLA`(수도 + 광역 행정중심지)만 사용 → 구·동 노이즈 제외, 행정구역별 대표 도시.
- 좌표는 GeoNames 원본. `regionId`는 위 경계 폴리곤에 point-in-polygon으로 계산(코드 매핑 불일치 회피). 섬·해안 등 단순화로 폴리곤 밖이면 가장 가까운 행정구역에 배정.
- `name`/`nameLocal`은 현재 로마자(GeoNames asciiname/name). 네이티브 표기는 추후 보강 대상.

> **GeoNames는 CC BY 4.0** — 저작자표시 필수. 앱 정보/크레딧 화면에 "City data © GeoNames (CC BY 4.0)" 표기할 것.

## 재생성

`scripts/build-cities.js` 가 GeoNames `cities15000.txt`(다운로드 필요)와 `regions.*.json`을 읽어 `cities.*.json`을 생성한다. 경계 데이터는 위 원본을 받아 mapshaper로 단순화 후 변환한다(커밋 메시지 참고).
