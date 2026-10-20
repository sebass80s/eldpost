# Eldpost

Mobil webapp/PWA för att planera eldpost, patrull och vaktpost i ett tältlag över en eller flera nätter.

## Principer
- All data lagras endast lokalt i webbläsarens `localStorage`.
- Ingen databas, inget konto och ingen serverlagrad persondata.
- 4–20 personer och grafisk sovplatskarta.
- Förare får inte få ett schema som lämnar mindre än sex timmars sammanhängande vila under nattens planeringsfönster.
- Plutonchef, stf plutonchef och manuellt exkluderade personer schemaläggs inte.
- Patrull kan kopplas till avlöst eldpost: den avlöste plus en kamrat.
- Belastning roteras mellan flera genererade nätter.

Statisk app avsedd för Vercel.
