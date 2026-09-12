# Bittle Commander

Browserbediening voor Bittle X / BiBoard V1.0. Start met `npm start` (Node.js 22+), open http://127.0.0.1:4173.

Bluetooth BLE is de standaard. Klik Verbind Bittle en selecteer de robot. Alle bedieningsknoppen en de terminal gebruiken dezelfde verbinding. De Petoi BLE-UART-service en RX/TX-characteristics volgen OpenCatEsp32 src/bleCommon.h. BLE heeft geen baudrate-instelling. De optionele USB/Bluetooth-seriële verbinding staat vast op 115200 baud.

Testmodus verstuurt niets naar hardware. Het activiteitenlog onderscheidt TX, RX, TEST en de bron van de opdracht. Seriële tekst wordt letterlijk weergegeven; verzending bevestigt geen fysieke uitvoering. BLE-opdrachten zijn maximaal 20 bytes inclusief afsluiting om ongeteste firmwarefragmentatie te vermijden; serieel maximaal 256 bytes.

Het oorspronkelijke bedieningsscherm, de terminal en testmodus zijn geïntegreerd. Live spraak met Pito is geïmplementeerd. Aangepaste firmware is nog niet geïmplementeerd.

`npm test` controleert de actuele app met een nagebootste BLE-verbinding: notifications, exacte verzending, verbreken en testmodus. De BLE-verbinding werd door de gebruiker bevestigd in de terminalversie; deze integratie is niet opnieuw fysiek op de robot getest.

Bron: https://github.com/PetoiCamp/OpenCatEsp32-Quadruped-Robot/blob/main/src/bleCommon.h

Commandobibliotheek: 93 upstream skills en gespiegelde looprichtingen; firmware/accessoires bepalen welke werken. Parameterformulieren: m, i, j, f, t, draaien via k, volume/toon via b en kalibratie c. Alle formulieren tonen het commando en valideren gehele getallen. Draaien op hoek vereist recente firmware met IMU; 2 seconden browserlimiet kan het draaien vroegtijdig stoppen. Binaire upload- en uitbreidingsprotocollen zijn alleen beschreven, niet geïmplementeerd als tekstcommando.

Motorselectie toont lichaamsdelen met logische Petoi-nummers. Volgorde: 8/12 linksvoor, 9/13 rechtsvoor, 10/14 rechtsachter, 11/15 linksachter (bovenste gewricht/knie). Links/rechts vanuit de robot. Bron: PetoiCamp/DesktopAppRelease pyUI/Calibrator.py en OpenCatEsp32 src/OpenCat.h. Extra kanalen 1–3 zijn niet aan een vast lichaamsdeel toegewezen.

## Gesprek met Pito

1. Start de lokale server met `npm start`.
2. Verbind Bittle via BLE of kies testmodus.
3. Open **OpenAI instellen** en voer een OpenAI-API-sleutel in. De ingevoerde sleutel blijft alleen in servergeheugen. De knop Sleutel vergeten verwijdert die sleutel. Een herstart wist de via de app ingevoerde sleutel.
4. Klik **Start gesprek** en geef de browser toestemming voor de microfoon. Pito stelt zich voor. Je kunt de microfoon ook vooraf uitzetten en typen.
5. Gebruik **Pito mag robotacties uitvoeren** om bewegingen toe te staan of uit te schakelen. De handmatige stopknop onderbreekt het gesprek en schakelt AI-acties uit. Gesprek stoppen sluit audio en microfoon en stopt eventueel door Pito gestart wandelen.

Audio, gespreksinvoer en opgevraagde recente robotfeedback gaan naar OpenAI. De stem wordt op de computer afgespeeld. OpenAI-API-gebruik wordt apart afgerekend; maximaal 15 minuten per sessie in deze app. Geen persistente gespreksopslag. De geschiedenis wordt bij een nieuw gesprek gewist.

Optioneel: kopieer `.env.example` naar `.env` en stel daar `OPENAI_API_KEY` in. Dit slaat de sleutel wel op schijf op; het bestand is uitgesloten van Git. `OPENAI_REALTIME_MODEL` is instelbaar; standaard `gpt-realtime-2.1` volgens de geraadpleegde Realtime-documentatie. Accounttoegang tot dat model is vereist.

Pito gebruikt een beperkte lijst rustige acties, hoofdbewegingen en wandelen tot 1500ms. Overige acties en kalibratie blijven handmatig. Toolargumenten worden lokaal gevalideerd; dubbele toolaanroepen worden genegeerd; onderbrekingen annuleren nog niet verstuurde acties. Feedback wordt als ruwe data gemarkeerd en bevestigt geen fysieke uitvoering. De loopstop is browsergestuurd, geen firmwaregarantie bij verbindingverlies.

Verificatie: automatische tests voor BLE, stoppen, parametercontrole, AI-toestemming, annulering en lokale API met nagebootste OpenAI-respons. Geen live OpenAI-/microfoon-/robotgesprek getest zolang geen echte sleutel is ingesteld.

Documentatie: https://developers.openai.com/api/docs/guides/voice-webrtc en https://developers.openai.com/api/docs/guides/realtime-conversations

### Uitgebreid hondengedrag
Pito gebruikt nu de volledige bewegingscatalogus van de bediening, inclusief salto’s en accessoirebewegingen. Systeeminstellingen (zoals kalibratie opslaan) blijven bij de handmatige bediening. Spontaan spelen staat standaard aan en is apart uitschakelbaar. Een actieve sessie kan om de 25 seconden, alleen als gesprek en robotbediening rustig zijn, een spontane actie kiezen. Wandelen blijft begrensd. Bij stunts wordt 4,5 seconden ruimte gelaten vóór een volgende actie; dit is geen sensorbevestiging van voltooiing. De app doet geen live robotstunts tijdens softwaretests.
Nieuwe gespreksinstructies en tools worden bij starten via session.update ingesteld; de lokale server hoeft hiervoor niet herstart te worden en behoudt de API-sleutel in geheugen.
