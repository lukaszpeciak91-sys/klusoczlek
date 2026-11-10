import test from 'node:test';
import assert from 'node:assert/strict';
import {FINAL_CREDITS,BIRTHDAY_DEDICATION} from '../src/final-credits-data.js';

// Exact main baseline before this additive-only polish; order and content immutable.
const original=[
  [
    "OPARTE NA MOTYWACH SMS-OWEJ OPOWIASTKI",
    "\"LEŚNI PRZYJACIELE\"\nMICHAŁA ALOESA ŚWIDERSKIEGO"
  ],
  [
    "KŁUSOCZŁEK",
    "A NEPAHU STUDIOS GAME"
  ],
  [
    "POMYSŁ, SCENARIUSZ I PRODUKCJA",
    "Łukasz Peciak"
  ],
  [
    "REŻYSERIA",
    "Łukasz Peciak"
  ],
  [
    "PROJEKT GRY",
    "Łukasz Peciak"
  ],
  [
    "PROGRAMOWANIE I REALIZACJA",
    "Łukasz Peciak i AI"
  ],
  [
    "PROJEKT POSTACI I ŚWIATA",
    "Łukasz Peciak"
  ],
  [
    "GRAFIKA I ANIMACJE",
    "Tworzone z pomocą AI"
  ],
  [
    "MUZYKA",
    "Suno AI"
  ],
  [
    "EFEKTY DŹWIĘKOWE",
    "Proceduralne retro SFX"
  ],
  [
    "KIEROWNIK DS. KŁUSOWNICTWA",
    "Rudolf Kłusoczłek"
  ],
  [
    "NACZELNY SPECJALISTA DS. TRANSPORTU",
    "Kapitan Marian"
  ],
  [
    "DZIAŁ REKLAMACJI",
    "Świnia-Wróżka"
  ],
  [
    "INSPEKTOR ROWEROWY",
    "Błażej"
  ],
  [
    "KONTROLA JAKOŚCI LAWY",
    "Bogdan"
  ],
  [
    "GŁÓWNY SPECJALISTA DS. NICZEGO",
    "Krzyś"
  ],
  [
    "ASYSTENT GŁÓWNEGO SPECJALISTY DS. NICZEGO",
    "Andrzejek"
  ],
  [
    "KIEROWNIK DS. NIEUZASADNIONEGO NIEPOKOJU",
    "Bocianołak"
  ],
  [
    "SPECJALISTA DS. RZECZY,\nKTÓRE SAME SIĘ POPSUŁY",
    "Andrzejek"
  ],
  [
    "INSPEKTOR DS. PRZECIWDZIAŁANIA\nPONIEDZIAŁKOM",
    "Bobrozombi"
  ],
  [
    "KOMISJA DS. USTALENIA,\nKTO ZJADŁ KIEŁBASĘ",
    "Marcin, Błażej i Waldek"
  ],
  [
    "NADZÓR NAD PRAWIDŁOWYM\nPRZEBIEGIEM KATASTROF",
    "Kapitan Marian"
  ],
  [
    "KONTROLA JAKOŚCI KONTROLI JAKOŚCI",
    "Łukasz Peciak"
  ],
  [
    "OSOBA ODPOWIEDZIALNA\nZA CAŁE ZAMIESZANIE",
    "Michał Aloes Świderski"
  ],
  [
    "SPECJALNE PODZIĘKOWANIA",
    "Wszystkim Leśnym Przyjaciołom"
  ]
];
const additional=[
  [
    "KIEROWNIK DS. NIEKONTROLOWANYCH WRZASKÓW",
    "Marcin"
  ],
  [
    "SPECJALISTA DS. NIELEGALNEGO FRYZJERSTWA",
    "Marlena"
  ],
  [
    "NADZÓR NAD PRZEDWCZESNYM KOŃCEM ŚWIATA",
    "Rudolf Kłusoczłek"
  ],
  [
    "KOMISJA DS. POSZUKIWANIA ZAGINIONYCH KIEŁBAS",
    "Waldek"
  ],
  [
    "GŁÓWNY INSPEKTOR DS. TUPANIA",
    "Żubrokryptyda"
  ],
  [
    "DEPARTAMENT SPRAW BEZNADZIEJNYCH",
    "Maciek i Seba"
  ],
  [
    "PIERWSZE SZKICE BOBROZOMBI, BOCIANOŁAKÓW I ŻUBROKRYPTYD",
    "Michał Aloes Świderski"
  ]
];
const asPair=e=>[e.role,e.name];

test('final credits retain every original pair in unchanged order',()=>{
 const retained=FINAL_CREDITS.map(asPair).filter(([role])=>original.some(([r])=>r===role));
 assert.deepEqual(retained,original);
});

test('exactly seven approved additional pairs and correct authentic author',()=>{
 assert.equal(FINAL_CREDITS.length,original.length+7);
 const extra=FINAL_CREDITS.map(asPair).filter(([role])=>!original.some(([r])=>r===role));
 assert.deepEqual(extra.sort((a,b)=>a[0].localeCompare(b[0],'pl')),additional.sort((a,b)=>a[0].localeCompare(b[0],'pl')));
 const originalArt=FINAL_CREDITS.findIndex(x=>x.role==='PROJEKT POSTACI I ŚWIATA');
 assert.deepEqual(asPair(FINAL_CREDITS[originalArt+1]),['PIERWSZE SZKICE BOBROZOMBI, BOCIANOŁAKÓW I ŻUBROKRYPTYD','Michał Aloes Świderski']);
 assert.equal(BIRTHDAY_DEDICATION,'WSZYSTKIEGO NAJLEPSZEGO MICHAŁ!');
});
