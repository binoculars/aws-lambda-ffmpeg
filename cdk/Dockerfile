FROM node:19-alpine@sha256:88f6aa846169ea75341059f3104d6c5ebeac4be861a5adcf0489fccb55573ea7 as base

ADD ./ ./

RUN yarn --frozen-lockfile

CMD ["yarn", "cdk", "synth"]