FROM node:14-alpine@sha256:ed51af876dd7932ce5c1e3b16c2e83a3f58419d824e366de1f7b00f40c848c40 as base

ADD ./ ./

RUN yarn --frozen-lockfile

CMD ["yarn", "cdk", "synth"]