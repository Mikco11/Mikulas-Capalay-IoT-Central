var clientFromConnectionString = require('azure-iot-device-mqtt').clientFromConnectionString;
var Message = require('azure-iot-device').Message;

// Pripajaci string je skrateny z bezpecnostnych dovodov
var connectionString = 'HostName=iotc-41d0d00c-b2f5-4e92-aeac-adc4bb72d4be.azure-dev................yhupKoWm/opl86RFZW/KUvT53sj/KfZdZOs0Po=';
var client = clientFromConnectionString(connectionString);

const sensor = require('node-dht-sensor');
const Gpio = require('onoff').Gpio;

const LED = new Gpio(24, 'out'); //LED dioda BCM GPIO 24
const sensor_pin = 4 // GPIO pin senzora BCM GPIO pin 4
const sensor_type = 22 // typ senzora - 22 - AM2301


// Ziskanie a odoslanie telemetrickych dat.
function sendTelemetry() {

    var DHT = sensor.read(sensor_type, sensor_pin) // citanie udajov senzora
    var light = LED.readSync()   // zistenie stavu LED diody

    var data = JSON.stringify({
        temperature: DHT.temperature.toFixed(1),
        humidity: DHT.humidity.toFixed(1),
        LED: light.toString(),
        time: new Date()
    })

    var message = new Message(data);
    console.log('Sending message: ' + data);
    client.sendEvent(message, (err, res) => console.log(`Sent message: ${message.getData()}` +
        (err ? `; error: ${err.toString()}` : '') +
        (res ? `; status: ${res.constructor.name}` : '')));

}

// Odoslanie vlastnosti zariadenia.
function sendDeviceProperties(twin) {
var properties = {
        Model: 'AUTOMATRON 2000',
        ModelRpi: 'Raspberry pi 3 Model B',
        Connection: 'WiFi',
        ID_device: 'VM-C-RPI-001',
        SN_machine: 'A2K002264',        
    };
    twin.properties.reported.update(properties, (err) => console.log(`Sent device properties; ` +
        (err ? `error: ${err.toString()}` : `status: success`)));
}


var settings = {
    'setLED': (newValue, callback) => {
        newValue = newValue ? 1 : 0 // transformovanie hodnot true/false na 1/0
        LED.writeSync(newValue);    // zapnutie/vypnutie LED
        var currentLED = LED.readSync() ? true : false
        callback(currentLED, 'completed') //odoslanie aktualneho stavu LED a statusu spät do IoT Central
    },
};

// Spracovanie nastavenii prijate z IoT Central cez device twin a aj spätne odoslanie aktualizovaneho device twin.
function handleSettings(twin) {
    twin.on('properties.desired', function (desiredChange) {
        for (let setting in desiredChange) {
            if (settings[setting]) {
                console.log(`Received setting: ${setting}: ${desiredChange[setting].value}`);
                settings[setting](desiredChange[setting].value, (newValue, status) => {
                    var patch = {
                        [setting]: {
                            value: newValue,
                            status: status,
                            desiredVersion: desiredChange.$version,
                        }
                    }                    
                    twin.properties.reported.update(patch, (err) => console.log(`Sent setting update for ${setting}; ` +
                        (err ? `error: ${err.toString()}` : `status: success`)));
                });
            }
        }
    });
}
// Spracovanie príkazu z IoT Central
function onCommandEcho(request, response) {
    printDeviceMethodRequest(request);    
    console.log(`Echo ${request.payload.echotext}` ); // vypisanie spravny na konzolu
    // Odpoved
    response.send(200, 'Success', function(err) {
        if(!!err) {
            console.error('An error ocurred when sending a method response:\n' +
                err.toString());
        } else {
            console.log('Response to method \'' + request.methodName +
                '\' sent successfully.' );
        }
    });
  }

 // Skontrolovanie prijateho prikazu
function printDeviceMethodRequest(request) {   
    console.log('Received method call for method \'' + request.methodName + '\'');
    if(!!(request.payload)) {
        console.log('Payload:\n' + JSON.stringify(request.payload));
    }
}
// Spracovanie prijpojenia do IoT Central
var connectCallback = (err) => {
    if (err) {
        console.log(`Device could not connect to Azure IoT Central: ${err.toString()}`);
    } else {
        console.log('Device successfully connected to Azure IoT Central');       
        setInterval(sendTelemetry, 300000);  // Odoslanie telemetrickych udajov do IoT Central kazdych 5 minut. (300 000 ms)
        client.onDeviceMethod('echo', onCommandEcho); 
        client.getTwin((err, twin) => {
            if (err) {
                console.log(`Error getting device twin: ${err.toString()}`);
            } else {
                // Odoslanie vlastnosti zariadenia pri pripojeni do IoT Central.
                sendDeviceProperties(twin);

                //  Aplikovanie a spracovanie nastaveni pri zmene v IoT central.
                handleSettings(twin);

            }
        });

    }
};

// Pripojenie zariadenia do IoT Central.
client.open(connectCallback);

