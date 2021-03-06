import { validationResult } from 'express-validator';
import {
  createHttpError,
  responseJson,
  signToken,
  validationErrorFormat,
  printError,
} from '../../utils';
import { redis } from '../../configs';
import { ENV, COOKIE_KEY, REDIS_KEY } from '../../constants';
import { User } from '../../models';

const logInAction = async (req, res) => {
  const errors = validationResult(req).array();
  if (errors.length) {
    const { message } = validationErrorFormat(errors);
    return responseJson(res, createHttpError.badRequest(message));
  }

  // find the user based on email
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user)
    return responseJson(
      res,
      createHttpError.badRequest('Email does not exist. Please signup')
    );

  // if user is found make sure the email and password match
  // create authenticate method in user model
  if (!user.authenticate(password))
    return responseJson(
      res,
      createHttpError.unauthorized('Email or password does not match')
    );

  const { _id, name, role } = user;

  // generate access token
  const [accessToken, accessTokenErr] = signToken({
    audience: _id,
    secret: ENV.JWT_SECRET,
    expiresIn: ENV.ACCESS_TOKEN_EXPIRE,
  });

  // something went wrong while trying to generate an access token
  if (accessTokenErr) {
    printError('signToken', accessTokenErr);
    return responseJson(
      res,
      createHttpError.internalServerError(
        'Something went wrong while trying to generate an access token'
      )
    );
  }

  // generate refresh token
  const [refreshToken, refreshTokenErr] = signToken({
    audience: _id,
    secret: ENV.JWT_SECRET_REFRESH,
  });

  // something went wrong while trying to generate a refresh token
  if (refreshTokenErr) {
    printError('signToken', refreshTokenErr);
    return responseJson(
      res,
      createHttpError.internalServerError(
        'Something went wrong while trying to generate a refresh token'
      )
    );
  }

  // persist the refresh token as 'tc_refresh_token' in cookie
  res.cookie(COOKIE_KEY.REFRESH_TOKEN, refreshToken);

  // persist the refresh token in redis with expiry date
  await redis.setex(
    `${REDIS_KEY.REFRESH_TOKEN}:${_id}`,
    ENV.REFRESH_TOKEN_EXPIRE,
    refreshToken
  );

  // persist the access token in redis with expiry date
  await redis.setex(
    `${REDIS_KEY.ACCESS_TOKEN}:${_id}`,
    ENV.ACCESS_TOKEN_EXPIRE,
    accessToken
  );

  return responseJson(res, {
    accessToken,
    refreshToken,
    user: { _id, email, name, role },
  });
};

export default logInAction;
