# Classifier accuracy report

Source: sample-001.csv

Labelled listings: 292

## deterministic
Labelled basketball singles: 248 (no row from this classifier: 0)
Gate (is it a basketball single?): precision  86.1%, recall  64.9% [tp 161, fp 26, fn 87]
Identity (player + year + productLine + cardNumber + parallel): precision  26.2% (48/183 committed), accuracy  21.0% (52/248)

| field | precision | recall | correct | predicted | truth |
|---|---|---|---|---|---|
| player |  34.2% |  27.5% | 68 | 199 | 247 |
| year | 100.0% |  88.3% | 218 | 218 | 247 |
| productLine |  84.5% |  69.7% | 163 | 193 | 234 |
| cardNumber |  98.5% |  95.6% | 196 | 199 | 205 |
| parallel |  73.5% |  19.8% | 25 | 34 | 126 |
| serialLimit | 100.0% |  91.8% | 67 | 67 | 73 |
| isRookie |  97.5% |  91.7% | 77 | 79 | 84 |
| isAuto |  87.5% |  63.6% | 14 | 16 | 22 |

## jev
Labelled basketball singles: 248 (no row from this classifier: 0)
Gate (is it a basketball single?): precision  99.6%, recall  98.4% [tp 244, fp 1, fn 4]
Identity (player + year + productLine + cardNumber + parallel): precision  86.2% (81/94 committed), accuracy  39.1% (97/248)

| field | precision | recall | correct | predicted | truth |
|---|---|---|---|---|---|
| player |  98.8% |  97.2% | 240 | 243 | 247 |
| year | 100.0% |  98.0% | 242 | 242 | 247 |
| productLine | 100.0% |  44.0% | 103 | 103 | 234 |
| cardNumber |  98.5% |  96.6% | 198 | 201 | 205 |
| parallel | 100.0% |  30.2% | 38 | 38 | 126 |
| serialLimit | 100.0% | 100.0% | 73 | 73 | 73 |
| isRookie |  97.6% |  98.8% | 83 | 85 | 84 |
| isAuto |  86.4% |  86.4% | 19 | 22 | 22 |

