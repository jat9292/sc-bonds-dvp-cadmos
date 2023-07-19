# Read our [slides HERE](./Cadmos_CastDVP.pdf) 

Different use cases are possible with our implementation (we implemented the first two) : Simple atomic DvP (cash vs bond), Atomic DvP with forex, broker-intermediated transactions with no capital requirement from the broker, ​compliance module, multi-party trade.

<img width="1168" alt="Capture d’écran 2023-07-19 à 14 26 46" src="https://github.com/jat9292/sc-bonds-dvp-cadmos/assets/29425574/3329cccb-5b1e-4a89-a330-3bee2bfb1bc0">

<img width="1142" alt="Capture d’écran 2023-07-19 à 14 26 10" src="https://github.com/jat9292/sc-bonds-dvp-cadmos/assets/29425574/f924f40b-5ea7-4744-894e-b22e0d90fc78">

<img width="1167" alt="Capture d’écran 2023-07-19 à 14 22 29" src="https://github.com/jat9292/sc-bonds-dvp-cadmos/assets/29425574/5d63f05d-5c7b-4447-899e-b3df66ce2abd">

 

# Bond smart contracts based on `so | bond` model 

## getting started

If you are not at the root of this repo then change directory to `sc-bonds`.
- `cd sc-bonds`
- install `npm i`
- build contract using solidity : `npm run build`
- run tests `npm run test`

## setup constraints
To run tests on MacOS, do the following preliminary step before launching npm run test

```
export NODE_OPTIONS=--openssl-legacy-provider
```
