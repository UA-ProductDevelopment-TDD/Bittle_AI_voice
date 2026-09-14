# Bittle Commander

Browserbediening voor Bittle X / BiBoard V1.0. Start met `npm start` (Node.js 22+), open http://127.0.0.1:4173.

## Online demo via GitHub Pages

Iedere push naar `main` test de app, bouwt een statische versie en publiceert die via GitHub Pages. De verwachte project-URL is [ua-productdevelopment-tdd.github.io/Bittle_AI_voice](https://ua-productdevelopment-tdd.github.io/Bittle_AI_voice/). Met `npm run build:pages` kun je dezelfde uitvoer lokaal in `_site` maken.

De Pages-versie ondersteunt alle appfuncties: testmodus, Web Bluetooth/Web Serial, batterij-uitlezing, animaties en het live gesprek met Bobby. Voor het gesprek vult iedere gebruiker zijn eigen OpenAI-API-sleutel in. De app houdt die alleen in het geheugen van het geopende tabblad, slaat hem niet op en stuurt hem rechtstreeks naar OpenAI om een kortlevende Realtime-token te maken. Vernieuwen of sluiten wist de sleutel.

Dit is een bewuste BYOK-afweging om zonder database of extra hosting te kunnen werken. De officiële OpenAI-aanbeveling is om standaard-API-sleutels uitsluitend server-side te gebruiken en via een beveiligde backend een tijdelijke client-token uit te geven. Gebruik de Pages-sleutelmodus daarom alleen op een vertrouwde deployment, bij voorkeur met een aparte sleutel met een lage projectbestedingslimiet. Zet nooit een sleutel in de broncode, repository of GitHub-instellingen. De lokale servermodus blijft de veiligere keuze.

Bluetooth BLE is de standaard. Klik Verbind Bittle en selecteer de robot. Alle bedieningsknoppen en de terminal gebruiken dezelfde verbinding. De Petoi BLE-UART-service en RX/TX-characteristics volgen OpenCatEsp32 src/bleCommon.h. BLE heeft geen baudrate-instelling. De optionele USB/Bluetooth-seriële verbinding staat vast op 115200 baud.

Testmodus verstuurt niets naar hardware. Het activiteitenlog onderscheidt TX, RX, TEST en de bron van de opdracht. Seriële tekst wordt letterlijk weergegeven; verzending bevestigt geen fysieke uitvoering. BLE-opdrachten zijn maximaal 20 bytes inclusief afsluiting om ongeteste firmwarefragmentatie te vermijden; serieel maximaal 256 bytes.

De centrale batterijkaart vraagt bij het verbinden en vervolgens om de 30 seconden het officiële `P`-commando op. Een antwoord in de vorm `Voltage: 7.42 V` wordt ook correct verwerkt wanneer BLE het over meerdere pakketjes verdeelt. De kaart toont bewust de gemeten spanning en een globale waarschuwing, geen onnauwkeurig laadpercentage. Voor een 2S-accu volgt de waarschuwing de 7,0 V-grens uit de BiBoard V1-firmware. Met **Meten** kan de spanning tussendoor handmatig worden vernieuwd; testmodus toont 7,62 V als herkenbare demo.

Het oorspronkelijke bedieningsscherm, de terminal en testmodus zijn geïntegreerd. Live spraak met Bobby is geïmplementeerd. Aangepaste firmware is nog niet geïmplementeerd.

`npm test` controleert de actuele app met een nagebootste BLE-verbinding: notifications, exacte verzending, verbreken en testmodus. De BLE-verbinding werd door de gebruiker bevestigd in de terminalversie; deze integratie is niet opnieuw fysiek op de robot getest.

Bron: https://github.com/PetoiCamp/OpenCatEsp32-Quadruped-Robot/blob/main/src/bleCommon.h

Commandobibliotheek: 93 upstream skills en gespiegelde looprichtingen; firmware/accessoires bepalen welke werken. Het zoekveld boven de actielijst filtert direct op Nederlandse omschrijving en commandocode, zonder onderscheid tussen hoofdletters of accenten. Parameterformulieren: m, i, j, f, t, draaien via k, volume/toon via b en kalibratie c. Alle formulieren tonen het commando en valideren gehele getallen. Draaien op hoek vereist recente firmware met IMU; 2 seconden browserlimiet kan het draaien vroegtijdig stoppen. Binaire upload- en uitbreidingsprotocollen zijn alleen beschreven, niet geïmplementeerd als tekstcommando.

Motorselectie toont lichaamsdelen met logische Petoi-nummers. Volgorde: 8/12 linksvoor, 9/13 rechtsvoor, 10/14 rechtsachter, 11/15 linksachter (bovenste gewricht/knie). Links/rechts vanuit de robot. Bron: PetoiCamp/DesktopAppRelease pyUI/Calibrator.py en OpenCatEsp32 src/OpenCat.h. Extra kanalen 1–3 zijn niet aan een vast lichaamsdeel toegewezen.

## Gesprek met Bobby

1. Start de lokale server met `npm start`.
2. Verbind Bittle via BLE of kies testmodus.
3. Open **OpenAI instellen** en voer een OpenAI-API-sleutel in. De ingevoerde sleutel blijft alleen in servergeheugen. De knop Sleutel vergeten verwijdert die sleutel. Een herstart wist de via de app ingevoerde sleutel.
4. Klik **Start gesprek** en geef de browser toestemming voor de microfoon. Bobby stelt zich voor. Je kunt de microfoon ook vooraf uitzetten en typen.
5. Gebruik **Bobby mag robotacties uitvoeren** om bewegingen toe te staan of uit te schakelen. De handmatige stopknop onderbreekt het gesprek en schakelt AI-acties uit. Gesprek stoppen sluit audio en microfoon en stopt eventueel door Bobby gestart wandelen.
6. Met **Bobby mag echte hondengeluiden afspelen** bepaal je of Bobby af en toe een lokale blaf, huil, grom of snuffel mag toevoegen. De opnames worden niet naar een externe audiodienst gestuurd.

Audio, gespreksinvoer en opgevraagde recente robotfeedback gaan naar OpenAI. De stem wordt op de computer afgespeeld. OpenAI-API-gebruik wordt apart afgerekend; maximaal 15 minuten per sessie in deze app. Geen persistente gespreksopslag. De geschiedenis wordt bij een nieuw gesprek gewist.

Optioneel: kopieer `.env.example` naar `.env` en stel daar `OPENAI_API_KEY` in. Dit slaat de sleutel wel op schijf op; het bestand is uitgesloten van Git. `OPENAI_REALTIME_MODEL` is instelbaar; standaard `gpt-realtime-2.1` volgens de geraadpleegde Realtime-documentatie. Accounttoegang tot dat model is vereist.

Bobby gebruikt de volledige veilige bewegingscatalogus en daarnaast begrensde, parameteriseerbare hoofd- en lichaamsgebaren. Hij kan zijn nek 10–60 graden draaien, zijn lichaam 5–20 graden kantelen en met recente IMU-firmware een draai van 30–180 graden aanvragen. Kalibratie, firmware-reset, willekeurig firmwaregedrag en ruwe beenmotorcommando’s blijven buiten de gespreksagent. Toolargumenten worden lokaal gevalideerd; dubbele toolaanroepen worden genegeerd; onderbrekingen annuleren nog niet verstuurde acties. Feedback wordt als ruwe data gemarkeerd en bevestigt geen fysieke uitvoering. De loopstop is browsergestuurd, geen firmwaregarantie bij verbindingverlies.

Verificatie: automatische tests voor BLE, stoppen, parametercontrole, AI-toestemming, annulering en lokale API met nagebootste OpenAI-respons. Geen live OpenAI-/microfoon-/robotgesprek getest zolang geen echte sleutel is ingesteld.

Documentatie: https://developers.openai.com/api/docs/guides/voice-webrtc en https://developers.openai.com/api/docs/guides/realtime-conversations

### Uitgebreid hondengedrag
Bobby gebruikt nu de volledige bewegingscatalogus van de bediening, inclusief salto’s en accessoirebewegingen. Systeeminstellingen (zoals kalibratie opslaan) blijven bij de handmatige bediening. Spontaan spelen staat standaard aan en is apart uitschakelbaar. Een actieve sessie kan om de 25 seconden, alleen als gesprek en robotbediening rustig zijn, een spontane actie kiezen. Wandelen blijft begrensd. Bij stunts wordt 4,5 seconden ruimte gelaten vóór een volgende actie; dit is geen sensorbevestiging van voltooiing. De app doet geen live robotstunts tijdens softwaretests.
Nieuwe gespreksinstructies en tools worden bij starten via session.update ingesteld; de lokale server hoeft hiervoor niet herstart te worden en behoudt de API-sleutel in geheugen.

### Verhalen en choreografie

Bobby kent acht lokaal begrensde mini-scènes: begroeting, speuren, luisteren, kattenkwaad, trots, bedtijd en een rondje linksom of rechtsom. Een scène voert opdrachten bewust na elkaar uit en stopt zodra het gesprek wordt onderbroken. Het rondje bestaat uit twee hoekgestuurde halve draaien; door grip, ondergrond, firmware en IMU-afwijking is exact 360 graden niet gegarandeerd. De knoppen **Wat kun je?**, **Start avontuur** en **Doe een rondje** geven de agent gerichte gespreksaanleidingen. Parallelle toolaanroepen zijn uitgeschakeld, zodat een volgende beweging pas na het vorige resultaat wordt gekozen.

De karakterinstructie koppelt bewegingen nu aan betekenis: hoofd draaien bij luisteren of twijfelen, speuren en snuffelen bij zoeken, graven en terugdeinzen bij kattenkwaad, juichen bij succes en uitrekken/rusten bij afronding. Bij een langer avontuur gebruikt Bobby een eenvoudige lijn van aanleiding, reactie, beweging, korte vraag en vervolg op het antwoord.

### Animaties op een tijdlijn

Het aparte blok **Animaties op een tijdlijn** is een eenvoudige keyframe-editor voor de negen vrijheidsgraden van Bittle: de nek en acht pootgewrichten. Ieder gewricht heeft een eigen track, schuifregelaar en numerieke hoek. Alleen aangevinkte tracks worden in het geselecteerde keyframe opgenomen; onaangeraakte motoren krijgen dus niet automatisch een nulstand.

De meegeleverde voorbeeldanimatie laat alleen het hoofd nieuwsgierig links en rechts kijken. Sleep de rode afspeelkop, klik op de tijdruler of vul naast de afspeelkop een exact tijdstip in milliseconden in. Een gewone klik in een motortrack plaatst daar onmiddellijk een keyframe met de geïnterpoleerde hoek; een klik op een bestaande markering selecteert die voor bewerking. Via de rechtermuisknop kun je op het gekozen moment één track, alle aangevinkte tracks of alle negen tracks toevoegen en bestaande markeringen verwijderen. De tijdlijn heeft een eenvoudige schaal van 5, 10 of 30 seconden. De eerste tijd blijft 0 ms, animaties duren maximaal 30 seconden en bevatten 2–24 keyframes. Hoeken worden lokaal gevalideerd en lineair geïnterpoleerd op vijf frames per seconde.

Voor playback kiest de editor eerst een veilige beginhouding (balans, zitten of rusten) en verstuurt daarna alleen de opgenomen motortracks met Petoi's simultane `i`-commando. USB/serieel ontvangt een gecombineerd frame; BLE splitst hetzelfde frame automatisch in opdrachten van maximaal twintig bytes. **Animatie herhalen** speelt na de laatste frame opnieuw vanaf het begin zonder de beginhouding iedere ronde opnieuw te versturen; uitschakelen maakt de huidige ronde af. **Stoppen**, de algemene stopknop, de spatiebalk en het verbergen van de pagina breken playback onmiddellijk af; waar de verbinding dat nog toelaat wordt `kbalance` gestuurd. Animaties kunnen in browseropslag worden bewaard en als JSON worden geïmporteerd of geëxporteerd.

**Beweging opnemen** gebruikt OpenCatESP32's feedbackleerfunctie (`fl`). Deze functie vereist een BiBoard, recente firmware en Petoi-feedbackservo's uit recente productiebatches (volgens Petoi: na maart 2024). De firmware laat de servo's los, meet de fysiek voorgedane posities en beëindigt de opname wanneer de robot twee seconden niet meer wordt bewogen of het maximum van 125 firmwareframes is bereikt. De app leest het blok `=== Optimized Data ===`, gebruikt de nek en acht pootgewrichten, begrenst gemeten hoeken tot het veilige editorbereik en reduceert zo nodig naar maximaal 24 kernframes. Omdat de firmware geen timestamps meestuurt, reconstrueert de app de tijdlijn met 200 ms tussen de ontvangen frames; die timing kan daarna handmatig worden verfijnd. Bronnen: [Petoi Skill Composer](https://docs.petoi.com/desktop-app/skill-composer) en [OpenCatESP32 motion.h](https://github.com/PetoiCamp/OpenCatEsp32-Quadruped-Robot/blob/main/src/motion.h).

### Stem en hondengeluiden

Bobby gebruikt de OpenAI-stem `cedar`, met instructies voor een rustige, lage mannenstem en een licht Vlaamse toon. De vier meegeleverde hondengeluiden worden lokaal afgespeeld, overlappen elkaar niet en hebben een afkoelperiode van zes seconden. Een gesproken onderbreking of het uitzetten van de geluidsschakelaar stopt een lopend geluid.

De audiobestanden `bark.ogg`, `howl.ogg` en `growl.ogg` komen van Wikimedia Commons. `sniff.ogg` is een ingekort Freesound-fragment van Trashcan_Studios. Zie `THIRD_PARTY_NOTICES.md` voor bronlinks, bewerkingen en licenties.
