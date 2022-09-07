const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;


// Middleware...
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ry8sapj.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const doctorsTimes = client.db("doctors_time").collection("times");

        app.get('/times', async (req, res) => {
            const query = {};
            const cursor = doctorsTimes.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        // Adding or Creating ...

    } finally {
        // await client.close();
    }
}
run().catch(console.dir);





app.get('/', (req, res) => {
    res.send('Hello Server');
});
app.listen(port, () => {
    console.log("Listening on port");
});