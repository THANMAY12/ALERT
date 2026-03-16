import numpy as np
import tensorflow as tf
from tensorflow.keras.layers import Conv1D,Bidirectional,LSTM
from tensorflow.keras.layers import Dense,Attention
from tensorflow.keras.layers import GlobalAveragePooling1D
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input

X = np.load("data/X.npy")
y = np.load("data/y.npy")

input_layer = Input(shape=(20,11))

x = Conv1D(32,3,activation='relu')(input_layer)

x = Bidirectional(
    LSTM(64,return_sequences=True)
)(x)

attn = Attention()([x,x])

x = GlobalAveragePooling1D()(attn)

x = Dense(64,activation='relu')(x)

output = Dense(3,activation='softmax')(x)

model = Model(input_layer,output)

model.compile(
optimizer='adam',
loss='sparse_categorical_crossentropy',
metrics=['accuracy']
)

model.fit(X,y,epochs=20,batch_size=16)

model.save("models/landslide_model.h5")