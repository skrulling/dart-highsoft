# Match creation api
We would also like to create matches using an api.
Use Next.js endpoints
Should be POST, and body will look something like this:

```
{
  "type": 301,
  "legs": 2,
  "checkout": single
  "participants": [
    "Aleksander",
    "Joachim"
  ]
}
```
available options:

types: 201, 301, 501
checkout: single, double

The endpoint should return and object with two links
```
{
    scoringMode: url to normal scoring ui,
    spectatorMode: match url with ?spectator=true at the end
}
```

You should re-use logic for the current match creation ui, which supports all of these options.
If a provided player does not exist, we create it.
No auth needed on the endpoint