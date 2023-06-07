const express = require('express')
const app = express()
const port = 3000

app.get('/', (req, res) => {
    res.send('YogaLab Server')
})

app.listen(port, () => {
    console.log(`YogaLab listening on port ${port}`)
})