FROM node:16-alpine@sha256:fabc6adac6dba5e150130e10acfc11a81447be93f4bf384076abdb63dbd34033 as base

ADD ./ ./

RUN yarn --frozen-lockfile

CMD ["yarn", "cdk", "synth"]